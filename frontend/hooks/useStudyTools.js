"use client";

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

export default function useStudyTools() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(null); // "flashcards" | "quiz" | "summary"
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [sourceName, setSourceName] = useState("");

  const closeModal = () => {
    setIsOpen(false);
    setError("");
    setResult(null);
    setMode(null);
  };

  const runStudyTool = async (toolMode, { text, name }) => {
    if (!text || !text.trim()) {
      setError("This document doesn't have any readable text to work with.");
      setMode(toolMode);
      setIsOpen(true);
      return;
    }

    setMode(toolMode);
    setSourceName(name || "this document");
    setIsOpen(true);
    setIsLoading(true);
    setError("");
    setResult(null);

    const endpoint =
      toolMode === "flashcards"
        ? "/api/study/flashcards"
        : toolMode === "quiz"
        ? "/api/study/quiz"
        : "/api/study/summarize";

    try {
      const response = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || data?.error || "The request failed.");
      }

      if (toolMode === "flashcards") {
        setResult(data.flashcards || []);
      } else if (toolMode === "quiz") {
        setResult(data.quiz || []);
      } else {
        setResult(data.summary || "");
      }
    } catch (err) {
      setError(err.message || "Could not generate study material right now.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isOpen,
    mode,
    isLoading,
    error,
    result,
    sourceName,
    generateFlashcards: (attachment) =>
      runStudyTool("flashcards", { text: attachment.extractedText, name: attachment.name }),
    generateQuiz: (attachment) =>
      runStudyTool("quiz", { text: attachment.extractedText, name: attachment.name }),
    generateSummary: (attachment) =>
      runStudyTool("summary", { text: attachment.extractedText, name: attachment.name }),
    closeModal,
  };
}