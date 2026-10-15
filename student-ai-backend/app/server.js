const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();

const PORT = process.env.PORT || 8080;

app.use(express.json());

// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// --------------------------------------------------
// Upload directory
// --------------------------------------------------

const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// --------------------------------------------------
// File upload configuration
// --------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage
});

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "student-ai-assistant"
  });
});

// --------------------------------------------------
// Health check through ALB path
// --------------------------------------------------

app.get("/student-ai/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "student-ai-assistant"
  });
});

// --------------------------------------------------
// AI Assistant
// --------------------------------------------------

app.post("/api/ask", async (req, res) => {
  const { question } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({
      error: "Question is required"
    });
  }

  // Temporary fallback until Bedrock runtime access/quota
  // is available for this AWS environment.

  const answer =
    `Student AI Assistant received your question: "${question}". ` +
    `The AI service is connected to the StudentAI backend. ` +
    `Amazon Bedrock integration is planned for the final AI response.`;

  res.json({
    question,
    answer,
    provider: "StudentAI Backend"
  });
});

// --------------------------------------------------
// Upload study material
// --------------------------------------------------

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No file uploaded"
    });
  }

  res.json({
    message: "File uploaded successfully",

    file: {
      name: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      type: req.file.mimetype
    }
  });
});

// --------------------------------------------------
// List uploaded study materials
// --------------------------------------------------

app.get("/api/materials", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error("Unable to read uploads:", err);

      return res.status(500).json({
        error: "Unable to read uploaded materials"
      });
    }

    const materials = files
      .filter((file) => !file.startsWith("."))
      .map((file) => {
        const filePath = path.join(uploadDir, file);
        const stats = fs.statSync(filePath);

        return {
          name: file,
          size: stats.size,
          url: `/api/materials/${encodeURIComponent(file)}`
        };
      });

    res.json(materials);
  });
});

// --------------------------------------------------
// Open / download a specific study material
// --------------------------------------------------

app.get("/api/materials/:filename", (req, res) => {
  const filename = req.params.filename;

  // Decode URL-encoded filename
  const decodedFilename = decodeURIComponent(filename);

  // Prevent path traversal
  const safeFilename = path.basename(decodedFilename);

  const filePath = path.join(uploadDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: "File not found"
    });
  }

  res.sendFile(filePath);
});

// --------------------------------------------------
// Serve uploaded files directly
// --------------------------------------------------

app.use(
  "/uploads",
  express.static(uploadDir)
);

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Student AI Assistant running on port ${PORT}`);
});