
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";

import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  GetItemCommand,
  DeleteItemCommand
} from "@aws-sdk/client-dynamodb";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const REGION = "ap-southeast-2";
const BUCKET_NAME = "student-ai-materials-282516655352-ap-southeast-2-an";
const TABLE_NAME = "StudentMaterials";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 25000;
const GEMINI_MAX_RETRIES = 1;
const MAX_RESOURCE_SIZE = 7 * 1024 * 1024;

const s3 = new S3Client({ region: REGION });
const dynamodb = new DynamoDBClient({ region: REGION });

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-File-Name,X-File-Type",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is not configured");
    error.status = 500;
    throw error;
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GEMINI_TIMEOUT_MS
    );

    try {
      const result = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const rawText = await result.text();
      let data;

      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { rawResponse: rawText };
      }

      if (result.ok) {
        return data;
      }

      const error = new Error(
        data?.error?.message ||
        `Gemini returned HTTP ${result.status}`
      );

      error.status = result.status;

      const retryable =
        result.status === 429 ||
        result.status === 503 ||
        result.status >= 500;

      if (!retryable || attempt >= GEMINI_MAX_RETRIES) {
        throw error;
      }

      console.warn(
        `Gemini HTTP ${result.status}; retrying once.`
      );

    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error(
          `Gemini request timed out after ${GEMINI_TIMEOUT_MS} ms`
        );
        timeoutError.status = 504;
        throw timeoutError;
      }

      const retryable =
        error.status === 429 ||
        error.status === 503 ||
        (error.status >= 500 && error.status <= 599);

      if (!retryable || attempt >= GEMINI_MAX_RETRIES) {
        throw error;
      }

      console.warn(
        `Gemini error ${error.status}; retrying once.`
      );

    } finally {
      clearTimeout(timeout);
    }

    await new Promise(resolve =>
      setTimeout(resolve, 1000 * (2 ** attempt))
    );
  }

  throw new Error("Gemini request failed after retries");
}

async function answerQuestion(question, materialId) {
  const parts = [];

  if (materialId) {
    console.log("Loading academic resource:", materialId);

    const materialResult = await dynamodb.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          materialId: { S: materialId }
        }
      })
    );

    if (!materialResult.Item) {
      return response(404, {
        error: "Selected study material was not found"
      });
    }

    const fileName = materialResult.Item.fileName?.S;
    const s3Key = materialResult.Item.s3Key?.S;
    const contentType =
      materialResult.Item.contentType?.S ||
      "application/octet-stream";

    if (!s3Key) {
      return response(500, {
        error: "Study material has no S3 location"
      });
    }

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      })
    );

    if (!object.Body) {
      return response(500, {
        error: "Unable to read study material"
      });
    }

    const fileBytes = await object.Body.transformToByteArray();

    if (fileBytes.length > MAX_RESOURCE_SIZE) {
      return response(413, {
        error: "This resource is too large for AI context. Please use a file smaller than 7 MB."
      });
    }

    parts.push({
      text:
        "You are an academic assistant. Use the supplied study resource as the primary source. " +
        "Do not invent facts unsupported by it. If the answer is absent, say so and provide a short general explanation if useful.\n\n" +
        `Resource: ${fileName}\n\nStudent question: ${question}`
    });

    parts.push({
      inline_data: {
        mime_type: contentType,
        data: Buffer.from(fileBytes).toString("base64")
      }
    });
  } else {
    parts.push({
      text:
        "Answer the following academic question clearly and accurately.\n\n" +
        `Question: ${question}`
    });
  }

  console.log(
    materialId
      ? "Sending question with study resource to Gemini"
      : "Sending general question to Gemini"
  );

  let data;

  try {
    data = await callGemini({
      systemInstruction: {
        parts: [{
          text:
            "You are StudentAI, a helpful academic assistant for college students. " +
            "Give clear, accurate and concise explanations. Use headings, bullets and examples when helpful. " +
            "When a study resource is provided, prioritize that resource."
        }]
      },
      contents: [{
        role: "user",
        parts
      }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 700
      }
    });
  } catch (error) {
    console.error("Gemini API error:", error);

    const statusCode =
      error.status === 429 ? 429 :
      error.status === 503 ? 503 :
      error.status === 504 ? 504 : 502;

    return response(statusCode, {
      error: "AI service request failed",
      details: error.message,
      model: GEMINI_MODEL
    });
  }

  const answer = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    console.error("Gemini returned no answer:", JSON.stringify(data));

    return response(502, {
      error: "AI service returned no answer",
      details: data?.promptFeedback?.blockReason || null
    });
  }

  return response(200, {
    question,
    answer,
    source: materialId
      ? "Uploaded study material"
      : "General AI knowledge",
    materialId: materialId || null,
    provider: "Google Gemini",
    model: GEMINI_MODEL
  });
}

export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method;
    const path = event.requestContext?.http?.path;

    console.log("Request:", method, path);

    if (method === "OPTIONS") {
      return response(204, "");
    }

    // Diagnostic endpoint: GET /gemini-test
    if (method === "GET" && path === "/gemini-test") {
      console.log("Running minimal Gemini generation test");

      try {
        const data = await callGemini({
          contents: [{
            role: "user",
            parts: [{ text: "Reply with only the word OK." }]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8
          }
        });

        const answer = data?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

        return response(200, {
          success: true,
          model: GEMINI_MODEL,
          answer: answer || null
        });
      } catch (error) {
        console.error("Gemini generation test failed:", error);

        return response(
          error.status === 503 ? 503 :
          error.status === 429 ? 429 :
          error.status === 504 ? 504 : 502,
          {
            error: "Gemini generation test failed",
            model: GEMINI_MODEL,
            status: error.status || 0,
            details: error.message
          }
        );
      }
    }

    // Ask AI
    if (method === "POST" && path === "/ask") {
      let body = event.body;

      if (typeof body === "string") {
        if (event.isBase64Encoded) {
          body = Buffer.from(body, "base64").toString("utf8");
        }
        body = JSON.parse(body);
      }

      const question = body?.question?.trim();
      const materialId = body?.materialId || null;

      if (!question) {
        return response(400, {
          error: "Question is required"
        });
      }

      return await answerQuestion(question, materialId);
    }

    // Upload material
    if (method === "POST" && path === "/upload") {
      if (!event.body) {
        return response(400, {
          error: "No file data received"
        });
      }

      const materialId = randomUUID();

      const fileName =
        event.headers?.["x-file-name"] ||
        event.headers?.["X-File-Name"] ||
        `material-${materialId}.txt`;

      const contentType =
        event.headers?.["x-file-type"] ||
        event.headers?.["X-File-Type"] ||
        "application/octet-stream";

      const fileBuffer = Buffer.from(
        event.body,
        event.isBase64Encoded ? "base64" : "utf8"
      );

      if (fileBuffer.length > MAX_RESOURCE_SIZE) {
        return response(413, {
          error: "File is too large. Please upload a file smaller than 7 MB."
        });
      }

      const s3Key = `materials/${materialId}-${fileName}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: contentType
        })
      );

      await dynamodb.send(
        new PutItemCommand({
          TableName: TABLE_NAME,
          Item: {
            materialId: { S: materialId },
            fileName: { S: fileName },
            s3Key: { S: s3Key },
            contentType: { S: contentType },
            uploadedAt: { S: new Date().toISOString() }
          }
        })
      );

      return response(200, {
        message: "Material uploaded successfully",
        material: {
          materialId,
          fileName,
          s3Key,
          contentType
        }
      });
    }

    // List materials
    if (method === "GET" && path === "/materials") {
      const result = await dynamodb.send(
        new ScanCommand({
          TableName: TABLE_NAME
        })
      );

      const materials = (result.Items || []).map(item => ({
        materialId: item.materialId?.S,
        fileName: item.fileName?.S,
        s3Key: item.s3Key?.S,
        contentType: item.contentType?.S,
        uploadedAt: item.uploadedAt?.S
      }));

      return response(200, materials);
    }

    // Delete material
    if (
      method === "DELETE" &&
      path.startsWith("/materials/") &&
      path !== "/materials"
    ) {
      const materialId = path.split("/").pop();

      if (!materialId) {
        return response(400, {
          error: "Material ID is required"
        });
      }

      const result = await dynamodb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { materialId: { S: materialId } }
        })
      );

      if (!result.Item) {
        return response(404, {
          error: "Material not found"
        });
      }

      const s3Key = result.Item.s3Key?.S;
      const fileName = result.Item.fileName?.S;

      if (s3Key) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key
          })
        );
      }

      await dynamodb.send(
        new DeleteItemCommand({
          TableName: TABLE_NAME,
          Key: { materialId: { S: materialId } }
        })
      );

      return response(200, {
        message: "Material deleted successfully",
        materialId,
        fileName
      });
    }

    // View material
    if (
      method === "GET" &&
      path.startsWith("/materials/") &&
      path !== "/materials"
    ) {
      const materialId = path.split("/").pop();

      if (!materialId) {
        return response(400, {
          error: "Material ID is required"
        });
      }

      const result = await dynamodb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { materialId: { S: materialId } }
        })
      );

      if (!result.Item) {
        return response(404, {
          error: "Material not found"
        });
      }

      const fileName = result.Item.fileName?.S;
      const s3Key = result.Item.s3Key?.S;
      const contentType =
        result.Item.contentType?.S ||
        "application/octet-stream";

      if (!s3Key) {
        return response(500, {
          error: "Study material has no S3 location"
        });
      }

      const downloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          ResponseContentType: contentType,
          ResponseContentDisposition: `inline; filename="${fileName}"`
        }),
        { expiresIn: 900 }
      );

      return response(200, {
        materialId,
        fileName,
        contentType,
        downloadUrl,
        expiresIn: 900
      });
    }

    return response(404, {
      error: "Route not found",
      method,
      path
    });

  } catch (error) {
    console.error("StudentAI Lambda error:", error);

    return response(500, {
      error: "Internal server error",
      message: error.message
    });
  }
};
