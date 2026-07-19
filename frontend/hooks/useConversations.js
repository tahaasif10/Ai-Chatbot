"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

const TITLE_MAX_LENGTH = 48;
export const DEFAULT_CONVERSATION_TITLE = "New study chat";

function normalizeConversationTitle(text) {
  const compact = text.replace(/\s+/g, " ").trim();

  if (!compact) {
    return DEFAULT_CONVERSATION_TITLE;
  }

  if (compact.length <= TITLE_MAX_LENGTH) {
    return compact;
  }

  return `${compact.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}

export default function useConversations() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadConversations = async () => {
    const response = await authFetch("/api/conversations");
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setHistoryError(data?.error || "Could not load chat history.");
      setConversations([]);
    } else {
      setHistoryError("");
      setConversations(data?.conversations || []);
    }

    setIsHistoryLoading(false);
  };

  useEffect(() => {
    const historyTimer = window.setTimeout(() => {
      loadConversations();
    }, 0);

    return () => window.clearTimeout(historyTimer);
  }, []);

  const createConversation = async () => {
    const response = await authFetch("/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: DEFAULT_CONVERSATION_TITLE,
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || "Could not create a conversation.");
    }

    setActiveConversationId(data.conversation.id);
    setConversations((prev) => [data.conversation, ...prev]);

    return data.conversation.id;
  };

  const generateConversationTitle = async ({
    conversationId,
    firstUserMessage,
    firstAssistantMessage,
  }) => {
    try {
      const response = await authFetch("/api/chat-title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userMessage: firstUserMessage,
          assistantMessage: firstAssistantMessage,
        }),
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const title = normalizeConversationTitle(data?.title || "");
      const updatedAt = new Date().toISOString();
      const updateResponse = await authFetch("/api/conversations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: conversationId, title, updated_at: updatedAt }),
      });
      const updateData = await updateResponse.json().catch(() => null);

      if (!updateResponse.ok) {
        setHistoryError("The chat title was generated, but could not be saved.");
        return;
      }

      setHistoryError("");
      setConversations((prev) => [
        updateData.conversation,
        ...prev.filter((conversation) => conversation.id !== conversationId),
      ]);
    } catch {
      setHistoryError("The chat was saved, but the title could not be generated.");
    }
  };

  const touchConversation = async (conversationId) => {
    const updatedAt = new Date().toISOString();
    const response = await authFetch("/api/conversations", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: conversationId, updated_at: updatedAt }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setHistoryError(
        "The chat was saved, but the sidebar order could not be updated."
      );
      return;
    }

    setConversations((prev) => [
      data.conversation,
      ...prev.filter((conversation) => conversation.id !== conversationId),
    ]);
  };

  return {
    conversations,
    activeConversationId,
    isHistoryLoading,
    isConversationLoading,
    historyError,
    setActiveConversationId,
    setIsConversationLoading,
    createConversation,
    generateConversationTitle,
    touchConversation,
  };
}
