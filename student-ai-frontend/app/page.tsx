"use client";

import { useEffect, useMemo, useState } from "react";
import { Amplify } from "aws-amplify";
  import {
    signIn,
    signUp,
    confirmSignUp,
    signOut,
    getCurrentUser,
    fetchAuthSession,
  } from "aws-amplify/auth";

import { Inter, Space_Grotesk } from "next/font/google";


const inter = Inter({
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
});

const API_URL =
  "https://6wamiwxa93.execute-api.ap-southeast-2.amazonaws.com";

const COGNITO_CONFIG = {
  Auth: {
    Cognito: {
      userPoolId: "ap-southeast-2_kTJScbJwE",
      userPoolClientId: "39nc41edgtipvmmstqvmg06981",
    },
  },
};

Amplify.configure(COGNITO_CONFIG);

type Material = {
  materialId: string;
  fileName: string;
  s3Key?: string;
  contentType?: string;
  uploadedAt?: string;
};

type View = "dashboard" | "library";

export default function Home() {
  const [view, setView] = useState<View>("dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [confirmCode, setConfirmCode] = useState("");

  const [authenticated, setAuthenticated] =
    useState(false);

  const [needsVerification, setNeedsVerification] =
    useState(false);

  const [authMode, setAuthMode] =
    useState<"signin" | "signup">("signin");

  const [authLoading, setAuthLoading] =
    useState(false);

  const [authMessage, setAuthMessage] =
    useState("");

  const [question, setQuestion] =
    useState("");

  const [answer, setAnswer] =
    useState("");

  const [answerSource, setAnswerSource] =
    useState("");

  const [selectedMaterialId, setSelectedMaterialId] =
    useState("");

  const [materials, setMaterials] =
    useState<Material[]>([]);

  const [loadingMaterials, setLoadingMaterials] =
    useState(false);

  const [librarySearch, setLibrarySearch] =
    useState("");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [uploadMessage, setUploadMessage] =
    useState("");

  const [asking, setAsking] =
    useState(false);

  const [openingMaterial, setOpeningMaterial] =
    useState("");

  const [deletingMaterial, setDeletingMaterial] =
    useState("");

  const [showMobileMenu, setShowMobileMenu] =
    useState(false);

  // ============================================================
  // AUTH
  // ============================================================

  async function getAccessToken() {
    const session = await fetchAuthSession();

    const token =
      session.tokens?.idToken?.toString();

    if (!token) {
      throw new Error(
        "Authentication token not available"
      );
    }

    return token;
  }

  async function authHeaders() {
    const token = await getAccessToken();

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  async function checkAuth() {
    try {
      await getCurrentUser();

      setAuthenticated(true);

      await loadMaterials();
    } catch {
      setAuthenticated(false);
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  async function handleSignIn() {
    if (!email || !password) {
      setAuthMessage(
        "Please enter your email and password."
      );
      return;
    }

    try {
      setAuthLoading(true);
      setAuthMessage("");

      await signIn({
        username: email,
        password,
      });

      setAuthenticated(true);

      await loadMaterials();
    } catch (error: any) {
      console.error(error);

      setAuthMessage(
        error?.message ||
          "Unable to sign in."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignUp() {
    if (!email || !password) {
      setAuthMessage(
        "Please enter your email and password."
      );
      return;
    }

    try {
      setAuthLoading(true);
      setAuthMessage("");

      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });

      setNeedsVerification(true);

      setAuthMessage(
        "Account created. Check your email for the verification code."
      );
    } catch (error: any) {
      console.error(error);

      setAuthMessage(
        error?.message ||
          "Unable to create account."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleConfirmSignUp() {
    if (!confirmCode) {
      setAuthMessage(
        "Enter the verification code."
      );
      return;
    }

    try {
      setAuthLoading(true);
      setAuthMessage("");

      await confirmSignUp({
        username: email,
        confirmationCode: confirmCode,
      });

      setNeedsVerification(false);
      setAuthMode("signin");

      setAuthMessage(
        "Email verified. You can now sign in."
      );
    } catch (error: any) {
      console.error(error);

      setAuthMessage(
        error?.message ||
          "Unable to verify account."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await signOut();

    setAuthenticated(false);
    setMaterials([]);
    setAnswer("");
    setQuestion("");
    setSelectedMaterialId("");
    setView("dashboard");
  }

  // ============================================================
  // LOAD MATERIALS
  // ============================================================

  async function loadMaterials() {
    try {
      setLoadingMaterials(true);

      const headers =
        await authHeaders();

      const response = await fetch(
        `${API_URL}/materials`,
        {
          method: "GET",
          headers,
        }
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load materials"
        );
      }

      const data =
        await response.json();

      setMaterials(
        Array.isArray(data) ? data : []
      );
    } catch (error) {
      console.error(
        "Load materials error:",
        error
      );
    } finally {
      setLoadingMaterials(false);
    }
  }

  // ============================================================
  // ASK AI
  // ============================================================

  async function askAI() {
    if (!question.trim()) {
      return;
    }

    try {
      setAsking(true);
      setAnswer("");
      setAnswerSource("");

      const headers =
        await authHeaders();

      const response = await fetch(
        `${API_URL}/ask`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            question: question.trim(),
            materialId:
              selectedMaterialId ||
              null,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "AI request failed"
        );
      }

      setAnswer(
        data?.answer ||
          "No answer received."
      );

      setAnswerSource(
        data?.source ||
          "General AI knowledge"
      );
    } catch (error: any) {
      console.error(error);

      setAnswer(
        error?.message ||
          "Unable to get an answer."
      );

      setAnswerSource("");
    } finally {
      setAsking(false);
    }
  }

  // ============================================================
  // UPLOAD
  // ============================================================

  async function uploadMaterial() {
    if (!selectedFile) {
      setUploadMessage(
        "Please choose a file first."
      );
      return;
    }

    const maxSize =
      7 * 1024 * 1024;

    if (selectedFile.size > maxSize) {
      setUploadMessage(
        "File is too large. Maximum size is 7 MB."
      );
      return;
    }

    try {
      setUploading(true);
      setUploadMessage("");

      const headers =
        await authHeaders();

      const arrayBuffer =
        await selectedFile.arrayBuffer();

      const bytes =
        new Uint8Array(arrayBuffer);

      let binary = "";

      const chunkSize = 0x8000;

      for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
      ) {
        binary += String.fromCharCode(
          ...bytes.subarray(
            i,
            Math.min(
              i + chunkSize,
              bytes.length
            )
          )
        );
      }

      const base64 =
        btoa(binary);

      const response = await fetch(
        `${API_URL}/upload`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type":
              "text/plain",
            "X-File-Name":
              selectedFile.name,
            "X-File-Type":
              selectedFile.type ||
              "application/octet-stream",
          },
          body: base64,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Upload failed"
        );
      }

      setUploadMessage(
        "Material uploaded successfully."
      );

      setSelectedFile(null);

      const fileInput =
        document.getElementById(
          "file-upload"
        ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      await loadMaterials();
    } catch (error: any) {
      console.error(error);

      setUploadMessage(
        error?.message ||
          "Unable to upload material."
      );
    } finally {
      setUploading(false);
    }
  }

  // ============================================================
  // VIEW MATERIAL
  // ============================================================

  async function viewMaterial(
    materialId: string
  ) {
    try {
      setOpeningMaterial(materialId);

      const headers =
        await authHeaders();

      const response = await fetch(
        `${API_URL}/materials/${materialId}`,
        {
          method: "GET",
          headers,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to open material"
        );
      }

      window.open(
        data.downloadUrl,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error: any) {
      console.error(error);

      alert(
        error?.message ||
          "Unable to open material."
      );
    } finally {
      setOpeningMaterial("");
    }
  }

  // ============================================================
  // DELETE MATERIAL
  // ============================================================

  async function deleteMaterial(
    materialId: string,
    fileName: string
  ) {
    const confirmed =
      window.confirm(
        `Delete "${fileName}"?\n\nThis will remove the resource from your Study Library.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingMaterial(materialId);

      const headers =
        await authHeaders();

      const response = await fetch(
        `${API_URL}/materials/${materialId}`,
        {
          method: "DELETE",
          headers,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to delete material"
        );
      }

      if (
        selectedMaterialId ===
        materialId
      ) {
        setSelectedMaterialId("");
      }

      await loadMaterials();
    } catch (error: any) {
      console.error(error);

      alert(
        error?.message ||
          "Unable to delete material."
      );
    } finally {
      setDeletingMaterial("");
    }
  }

  // ============================================================
  // USE MATERIAL WITH AI
  // ============================================================

  function useWithAI(
    materialId: string
  ) {
    setSelectedMaterialId(
      materialId
    );

    setView("dashboard");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ============================================================
  // SEARCH
  // ============================================================

  const filteredMaterials =
    useMemo(() => {
      const query =
        librarySearch
          .trim()
          .toLowerCase();

      if (!query) {
        return materials;
      }

      return materials.filter(
        (material) =>
          material.fileName
            ?.toLowerCase()
            .includes(query) ||
          material.contentType
            ?.toLowerCase()
            .includes(query)
      );
    }, [
      materials,
      librarySearch,
    ]);

  // ============================================================
  // FORMATTERS
  // ============================================================

  function formatFileType(
    contentType?: string
  ) {
    if (!contentType) {
      return "FILE";
    }

    if (
      contentType.includes("pdf")
    ) {
      return "PDF";
    }

    if (
      contentType.includes("word") ||
      contentType.includes("document")
    ) {
      return "DOCX";
    }

    if (
      contentType.includes("text")
    ) {
      return "TXT";
    }

    return contentType
      .split("/")
      .pop()
      ?.toUpperCase() || "FILE";
  }

  function formatDate(
    date?: string
  ) {
    if (!date) {
      return "";
    }

    return new Date(date).toLocaleDateString(
      undefined,
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  // ============================================================
  // AUTH SCREEN
  // ============================================================

  if (!authenticated) {
    return (
      <main
        className={`${inter.className} min-h-screen bg-[#05050a] text-white`}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[130px]" />
          <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-fuchsia-600/20 blur-[130px]" />
        </div>

        <div className="relative flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl shadow-lg shadow-violet-500/20">
                ✦
              </div>

              <h1
                className={`${spaceGrotesk.className} text-3xl font-bold`}
              >
                MentoraAI
              </h1>

              <p className="mt-2 text-sm text-white/50">
                Your academic assistant
              </p>
            </div>

            {needsVerification ? (
              <>
                <h2 className="mb-2 text-xl font-semibold">
                  Verify your email
                </h2>

                <p className="mb-6 text-sm text-white/50">
                  Enter the verification code
                  sent to your email.
                </p>

                <input
                  value={confirmCode}
                  onChange={(e) =>
                    setConfirmCode(
                      e.target.value
                    )
                  }
                  placeholder="Verification code"
                  className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400"
                />

                <button
                  onClick={
                    handleConfirmSignUp
                  }
                  disabled={authLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 font-semibold transition hover:opacity-90 disabled:opacity-50"
                >
                  {authLoading
                    ? "Verifying..."
                    : "Verify account"}
                </button>
              </>
            ) : (
              <>
                <div className="mb-6 flex rounded-xl bg-white/5 p-1">
                  <button
                    onClick={() =>
                      setAuthMode("signin")
                    }
                    className={`flex-1 rounded-lg py-2 text-sm ${
                      authMode ===
                      "signin"
                        ? "bg-white/10 text-white"
                        : "text-white/40"
                    }`}
                  >
                    Sign in
                  </button>

                  <button
                    onClick={() =>
                      setAuthMode("signup")
                    }
                    className={`flex-1 rounded-lg py-2 text-sm ${
                      authMode ===
                      "signup"
                        ? "bg-white/10 text-white"
                        : "text-white/40"
                    }`}
                  >
                    Create account
                  </button>
                </div>

                <div className="space-y-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(
                        e.target.value
                      )
                    }
                    placeholder="Email address"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400"
                  />

                  <input
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    placeholder="Password"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-violet-400"
                  />

                  <button
                    onClick={
                      authMode ===
                      "signin"
                        ? handleSignIn
                        : handleSignUp
                    }
                    disabled={authLoading}
                    className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 font-semibold transition hover:opacity-90 disabled:opacity-50"
                  >
                    {authLoading
                      ? "Please wait..."
                      : authMode ===
                        "signin"
                      ? "Sign in"
                      : "Create account"}
                  </button>
                </div>
              </>
            )}

            {authMessage && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                {authMessage}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // MAIN APPLICATION
  // ============================================================

  return (
    <main
      className={`${inter.className} min-h-screen bg-[#05050a] text-white`}
    >
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[140px]" />

        <div className="absolute right-[-10%] top-[30%] h-[500px] w-[500px] rounded-full bg-fuchsia-600/10 blur-[140px]" />
      </div>

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#05050a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <button
            onClick={() =>
              setView("dashboard")
            }
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
              ✦
            </div>

            <div>
              <div
                className={`${spaceGrotesk.className} font-bold`}
              >
                MentoraAI
              </div>

              <div className="text-xs text-white/40">
                Academic Assistant
              </div>
            </div>
          </button>

          {/* Desktop navigation */}
          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={() =>
                setView("dashboard")
              }
              className={`rounded-xl px-4 py-2 text-sm transition ${
                view === "dashboard"
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              Dashboard
            </button>

            <button
              onClick={() =>
                setView("library")
              }
              className={`rounded-xl px-4 py-2 text-sm transition ${
                view === "library"
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              Study Library
              <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
                {materials.length}
              </span>
            </button>

            <button
              onClick={handleLogout}
              className="ml-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/20 hover:text-white"
            >
              Sign out
            </button>
          </div>

          {/* Mobile menu */}
          <button
            onClick={() =>
              setShowMobileMenu(
                !showMobileMenu
              )
            }
            className="rounded-xl border border-white/10 px-3 py-2 md:hidden"
          >
            ☰
          </button>
        </div>

        {showMobileMenu && (
          <div className="border-t border-white/10 px-6 py-4 md:hidden">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setView("dashboard");
                  setShowMobileMenu(false);
                }}
                className="rounded-xl bg-white/5 px-4 py-3 text-left"
              >
                Dashboard
              </button>

              <button
                onClick={() => {
                  setView("library");
                  setShowMobileMenu(false);
                }}
                className="rounded-xl bg-white/5 px-4 py-3 text-left"
              >
                Study Library
              </button>

              <button
                onClick={handleLogout}
                className="rounded-xl bg-white/5 px-4 py-3 text-left text-white/60"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* CONTENT */}
      <div className="relative mx-auto max-w-7xl px-6 py-10">
        {view === "dashboard" ? (
          <>
            {/* HERO */}
            <section className="mb-10">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  AI Assistant Online
                </div>

                <h1
                  className={`${spaceGrotesk.className} text-4xl font-bold tracking-tight md:text-6xl`}
                >
                  Learn smarter.
                  <br />
                  <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
                    Study better.
                  </span>
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-7 text-white/50 md:text-lg">
                  Ask questions, upload your study
                  materials, and use AI to understand
                  your academic resources faster.
                </p>
              </div>
            </section>

            {/* DASHBOARD GRID */}
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              {/* AI ASSISTANT */}
              <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-violet-300">
                      AI ASSISTANT
                    </p>

                    <h2
                      className={`${spaceGrotesk.className} mt-1 text-2xl font-bold`}
                    >
                      Ask anything
                    </h2>
                  </div>

                  <div className="rounded-xl bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
                    Gemini
                  </div>
                </div>

                {/* RESOURCE SELECTOR */}
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/40">
                    Answer using
                  </label>

                  <select
                    value={
                      selectedMaterialId
                    }
                    onChange={(e) =>
                      setSelectedMaterialId(
                        e.target.value
                      )
                    }
                    className="w-full rounded-2xl border border-white/10 bg-[#0d0d15] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/50"
                  >
                    <option value="">
                      ✦ General AI Knowledge
                    </option>

                    {materials.map(
                      (material) => (
                        <option
                          key={
                            material.materialId
                          }
                          value={
                            material.materialId
                          }
                        >
                          📄{" "}
                          {material.fileName}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* QUESTION */}
                <textarea
                  value={question}
                  onChange={(e) =>
                    setQuestion(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (e.metaKey ||
                        e.ctrlKey)
                    ) {
                      e.preventDefault();
                      askAI();
                    }
                  }}
                  placeholder="Ask a question about your studies..."
                  rows={6}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 outline-none transition placeholder:text-white/25 focus:border-violet-400/50"
                />

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-white/30">
                    ⌘ / Ctrl + Enter to ask
                  </span>

                  <button
                    onClick={askAI}
                    disabled={
                      asking ||
                      !question.trim()
                    }
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-violet-500/10 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {asking
                      ? "Thinking..."
                      : "Ask AI →"}
                  </button>
                </div>

                {/* ANSWER */}
                {answer && (
                  <div className="mt-6 rounded-2xl border border-violet-400/10 bg-violet-500/[0.05] p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-violet-300">
                        AI Response
                      </span>

                      {answerSource && (
                        <span className="text-xs text-white/30">
                          {answerSource}
                        </span>
                      )}
                    </div>

                    <div className="whitespace-pre-wrap text-sm leading-7 text-white/80">
                      {answer}
                    </div>
                  </div>
                )}
              </section>

              {/* UPLOAD */}
              <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-6">
                  <p className="text-sm font-medium text-fuchsia-300">
                    STUDY MATERIALS
                  </p>

                  <h2
                    className={`${spaceGrotesk.className} mt-1 text-2xl font-bold`}
                  >
                    Upload resource
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/40">
                    Add PDFs, documents, notes or
                    other study resources to your
                    library.
                  </p>
                </div>

                <label
                  htmlFor="file-upload"
                  className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center transition hover:border-violet-400/40 hover:bg-violet-500/[0.03]"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl">
                    ↑
                  </div>

                  <p className="font-medium">
                    {selectedFile
                      ? selectedFile.name
                      : "Choose a file"}
                  </p>

                  <p className="mt-2 text-xs text-white/35">
                    Maximum size: 7 MB
                  </p>

                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    onChange={(e) =>
                      setSelectedFile(
                        e.target.files?.[0] ||
                          null
                      )
                    }
                  />
                </label>

                <button
                  onClick={uploadMaterial}
                  disabled={
                    uploading ||
                    !selectedFile
                  }
                  className="mt-4 w-full rounded-xl bg-white/10 py-3 text-sm font-semibold transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uploading
                    ? "Uploading..."
                    : "Upload material"}
                </button>

                {uploadMessage && (
                  <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-white/60">
                    {uploadMessage}
                  </div>
                )}

                <button
                  onClick={() =>
                    setView("library")
                  }
                  className="mt-4 w-full text-sm text-violet-300 transition hover:text-violet-200"
                >
                  Open Study Library →
                </button>
              </section>
            </div>

            {/* QUICK LIBRARY */}
            <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-white/30">
                    Your library
                  </p>

                  <h3
                    className={`${spaceGrotesk.className} mt-1 text-xl font-semibold`}
                  >
                    {materials.length} study resources
                  </h3>
                </div>

                <button
                  onClick={() =>
                    setView("library")
                  }
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
                >
                  View all →
                </button>
              </div>

              {materials.length > 0 && (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {materials
                    .slice(0, 3)
                    .map((material) => (
                      <button
                        key={
                          material.materialId
                        }
                        onClick={() =>
                          useWithAI(
                            material.materialId
                          )
                        }
                        className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-left transition hover:border-violet-400/20 hover:bg-white/[0.05]"
                      >
                        <div className="mb-3 text-lg">
                          📄
                        </div>

                        <div className="truncate text-sm font-medium">
                          {material.fileName}
                        </div>

                        <div className="mt-1 text-xs text-white/30">
                          {formatFileType(
                            material.contentType
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </section>
          </>
        ) : (
          /* ====================================================
             STUDY LIBRARY
             ==================================================== */

          <>
            <section className="mb-8">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div>
                  <div className="mb-3 inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
                    RESOURCE LIBRARY
                  </div>

                  <h1
                    className={`${spaceGrotesk.className} text-4xl font-bold md:text-5xl`}
                  >
                    Study Library
                  </h1>

                  <p className="mt-3 text-white/40">
                    Search, open, use with AI, or
                    remove your study resources.
                  </p>
                </div>

                <button
                  onClick={() =>
                    setView("dashboard")
                  }
                  className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold"
                >
                  + Upload resource
                </button>
              </div>
            </section>

            {/* SEARCH */}
            <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                  ⌕
                </span>

                <input
                  value={librarySearch}
                  onChange={(e) =>
                    setLibrarySearch(
                      e.target.value
                    )
                  }
                  placeholder="Search resources by file name or type..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-white/25 focus:border-violet-400/40"
                />
              </div>
            </section>

            {/* STATS */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-2xl font-bold">
                  {materials.length}
                </div>

                <div className="mt-1 text-xs text-white/35">
                  Total resources
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-2xl font-bold">
                  {filteredMaterials.length}
                </div>

                <div className="mt-1 text-xs text-white/35">
                  Search results
                </div>
              </div>

              <div className="hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:block">
                <div className="text-2xl font-bold">
                  {materials.filter(
                    (m) =>
                      m.contentType?.includes(
                        "pdf"
                      )
                  ).length}
                </div>

                <div className="mt-1 text-xs text-white/35">
                  PDF resources
                </div>
              </div>
            </div>

            {/* MATERIAL LIST */}
            {loadingMaterials ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center text-white/40">
                Loading your study library...
              </div>
            ) : filteredMaterials.length ===
              0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-16 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-2xl">
                  📚
                </div>

                <h3 className="text-lg font-semibold">
                  {librarySearch
                    ? "No matching resources"
                    : "Your library is empty"}
                </h3>

                <p className="mt-2 text-sm text-white/35">
                  {librarySearch
                    ? "Try a different search term."
                    : "Upload your first study resource to get started."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMaterials.map(
                  (material) => (
                    <div
                      key={
                        material.materialId
                      }
                      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-violet-400/20 hover:bg-white/[0.045] md:p-5"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-xl">
                            📄
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold md:text-base">
                              {material.fileName}
                            </h3>

                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/30">
                              <span>
                                {formatFileType(
                                  material.contentType
                                )}
                              </span>

                              {material.uploadedAt && (
                                <>
                                  <span>
                                    •
                                  </span>

                                  <span>
                                    Uploaded{" "}
                                    {formatDate(
                                      material.uploadedAt
                                    )}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <button
                            onClick={() =>
                              viewMaterial(
                                material.materialId
                              )
                            }
                            disabled={
                              openingMaterial ===
                              material.materialId
                            }
                            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            {openingMaterial ===
                            material.materialId
                              ? "Opening..."
                              : "View"}
                          </button>

                          <button
                            onClick={() =>
                              useWithAI(
                                material.materialId
                              )
                            }
                            className="rounded-xl bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                          >
                            Use with AI
                          </button>

                          <button
                            onClick={() =>
                              deleteMaterial(
                                material.materialId,
                                material.fileName
                              )
                            }
                            disabled={
                              deletingMaterial ===
                              material.materialId
                            }
                            className="rounded-xl bg-red-500/10 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                          >
                            {deletingMaterial ===
                            material.materialId
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* FOOTER */}
      <footer className="relative border-t border-white/5 px-6 py-8 text-center text-xs text-white/20">
        MentoraAI • AWS-powered academic assistant • CI/CD enabled
      </footer>
    </main>
  );
}