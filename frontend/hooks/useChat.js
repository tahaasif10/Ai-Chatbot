"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import useSmoothStream from "./useSmoothStream";
import { shouldStopStream } from "./streamStopHelpers";

const SCROLL_PIN_THRESHOLD = 160;
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isAcceptedFile(file) {
  return file.type.startsWith("image/") || ACCEPTED_ATTACHMENT_TYPES.has(file.type);
}

function toStoredAttachment(attachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    url: attachment.url,
    size: attachment.size,
    extractedText: attachment.extractedText || "",
  };
}

function toUiMessage(message) {
  return {
    id: message.id,
    role: message.role === "assistant" ? "bot" : "user",
    text: message.content,
    attachments: message.attachments || [],
    status: "complete",
  };
}

function toApiMessage(message) {
  return {
    role: message.role === "bot" ? "assistant" : "user",
    content: message.text,
    attachments: message.attachments || [],
  };
}

export default function useChat({
  activeConversationId,
  setActiveConversationId,
  setIsConversationLoading,
  createConversation,
  generateConversationTitle,
  touchConversation,
  onMessageCompleted,
}) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatError, setChatError] = useState("");
  const [retryRequest, setRetryRequest] = useState(null);
  const messagesAreaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const activeReaderRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const shouldPinScrollRef = useRef(true);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (!shouldPinScrollRef.current) return;

    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const {
    enqueueStreamText,
    flushStreamQueue,
    waitForSmoothStream,
    resetSmoothStream,
    cancelSmoothStream,
  } = useSmoothStream({ setMessages, scrollToBottom });

  const handleMessagesScroll = () => {
    const element = messagesAreaRef.current;

    if (!element) return;

    shouldPinScrollRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      SCROLL_PIN_THRESHOLD;
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      abortControllerRef.current?.abort();
      activeReaderRef.current?.cancel().catch(() => {});
      cancelSmoothStream();
    };
  }, [cancelSmoothStream]);

  const loadConversationMessages = async (conversationId) => {
    if (isGenerating) return;

    setChatError("");
    setRetryRequest(null);
    setIsConversationLoading(true);
    setActiveConversationId(conversationId);
    setAttachments([]);

    const response = await authFetch(
      `/api/messages?conversationId=${encodeURIComponent(conversationId)}`
    );
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setMessages([]);
      setChatError(data?.error || "Could not load this conversation.");
    } else {
      setMessages((data?.messages || []).map(toUiMessage));
    }

    setIsConversationLoading(false);
  };

  const handleNewChat = () => {
    if (isGenerating) return;

    setActiveConversationId(null);
    setMessages([]);
    setInputValue("");
    setAttachments([]);
    setChatError("");
    setRetryRequest(null);
  };

  const saveMessage = async ({
    conversationId,
    role,
    content,
    attachments = [],
  }) => {
    const response = await authFetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        role,
        content,
        attachments,
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || `Could not save the ${role} message.`);
    }

    return toUiMessage(data.message);
  };

  const handleFileSelect = async (files) => {
    const newAttachments = Array.from(files).map((file) => ({
      id: `temp-${Date.now()}-${Math.random()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      status: "uploading",
      fileObj: file,
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);

    for (const tempAtt of newAttachments) {
      const formData = new FormData();
      formData.append("file", tempAtt.fileObj);

      try {
        const response = await authFetch("/api/attachments/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data) {
          throw new Error(data?.error || "Upload failed.");
        }

        setAttachments((prev) =>
          prev.map((item) =>
            item.id === tempAtt.id
              ? {
                  id: data.id,
                  name: data.name,
                  type: data.type,
                  url: data.url,
                  size: data.size,
                  extractedText: data.extractedText,
                  status: "complete",
                }
              : item
          )
        );
      } catch (err) {
        console.error("File upload error:", err);
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === tempAtt.id
              ? {
                  ...item,
                  status: "error",
                  error: err.message || "Failed to upload",
                }
              : item
          )
        );
      }
    }
  };

  const handleRemoveAttachment = (id) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const streamAssistantResponse = async ({
    conversationId,
    apiMessages,
    shouldGenerateTitle = false,
    firstUserMessage = "",
  }) => {
    const botMsg = {
      id: `streaming-${Date.now()}`,
      role: "bot",
      text: "",
      status: "thinking",
    };
    const abortController = new AbortController();
    let assistantText = "";

    resetSmoothStream();
    stopRequestedRef.current = false;
    activeReaderRef.current = null;
    abortControllerRef.current = abortController;
    setMessages((prev) => [...prev, botMsg]);

    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: apiMessages,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "The chat request failed.");
      }

      if (!response.body) {
        throw new Error("The chat response did not include a stream.");
      }

      const reader = response.body.getReader();
      activeReaderRef.current = reader;
      const decoder = new TextDecoder();

      while (true) {
        if (shouldStopStream(abortController.signal, stopRequestedRef.current)) {
          break;
        }

        const { value, done } = await reader.read();

        if (done || shouldStopStream(abortController.signal, stopRequestedRef.current)) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        assistantText += chunk;
        enqueueStreamText(botMsg.id, chunk);
      }

      const finalChunk = decoder.decode();

      if (finalChunk) {
        assistantText += finalChunk;
        enqueueStreamText(botMsg.id, finalChunk);
      }

      if (shouldStopStream(abortController.signal, stopRequestedRef.current)) {
        throw new DOMException("The operation was aborted", "AbortError");
      }

      if (assistantText.trim()) {
        flushStreamQueue(botMsg.id, "complete");

        const finalizeAssistantMessage = async () => {
          try {
            const savedBotMsg = await saveMessage({
              conversationId,
              role: "assistant",
              content: assistantText,
            });

            setMessages((prev) =>
              prev.map((message) =>
                message.id === botMsg.id ? savedBotMsg : message
              )
            );

            if (shouldGenerateTitle) {
              await generateConversationTitle({
                conversationId,
                firstUserMessage,
                firstAssistantMessage: assistantText,
              });
            }

            try {
              await onMessageCompleted?.();
            } catch (error) {
              console.error("Usage refresh failed:", error);
            }
          } catch (error) {
            console.error("Assistant message finalization failed:", error);
          }
        };

        void finalizeAssistantMessage();
      }

      void touchConversation(conversationId).catch(() => {});
      setRetryRequest(null);
    } catch (error) {
      if (error.name === "AbortError") {
        flushStreamQueue(botMsg.id, "error");

        setMessages((prev) =>
          prev.map((message) =>
            message.id === botMsg.id
              ? {
                  ...message,
                  text: message.text || assistantText || "Generation stopped.",
                  status: message.text || assistantText ? "error" : "complete",
                }
              : message
          )
        );
        return;
      }

      const errorText =
        error.message || "Streaming failed before the response completed.";

      setChatError(`${errorText} You can retry this response.`);
      setRetryRequest({
        conversationId,
        apiMessages,
        shouldGenerateTitle,
        firstUserMessage,
      });
      flushStreamQueue(botMsg.id, "error");
      setMessages((prev) => {
        if (!prev.some((message) => message.id === botMsg.id)) {
          return prev;
        }

        return prev.map((message) =>
          message.id === botMsg.id
            ? {
                ...message,
                text: message.text || assistantText || errorText,
                status: "error",
              }
            : message
        );
      });
    } finally {
      activeReaderRef.current = null;
      abortControllerRef.current = null;
      stopRequestedRef.current = false;
    }
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    const completedAttachments = attachments.filter((att) => att.status === "complete");

    if ((!text && completedAttachments.length === 0) || isGenerating) return;

    const previousMessages = messages.filter(
      (message) =>
        message.status !== "error" &&
        (message.text?.trim() || message.attachments?.length > 0)
    );
    setIsGenerating(true);
    setChatError("");
    setRetryRequest(null);
    setAttachments([]);

    try {
      const isStartingNewConversation = !activeConversationId;
      const conversationId =
        activeConversationId || (await createConversation());

      const userMsg = await saveMessage({
        conversationId,
        role: "user",
        content: text,
        attachments: completedAttachments,
      });

      const nextMessages = [...previousMessages, userMsg];
      const apiMessages = nextMessages.map(toApiMessage);

      setMessages(nextMessages);
      setInputValue("");
      await streamAssistantResponse({
        conversationId,
        apiMessages,
        shouldGenerateTitle: isStartingNewConversation,
        firstUserMessage: text || "[Attached Files]",
      });
    } catch (error) {
      setChatError(
        error.message || "Sorry, I could not reach the chat service right now."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetry = async () => {
    if (!retryRequest || isGenerating) return;

    setIsGenerating(true);
    setChatError("");
    setMessages((prev) => prev.filter((message) => message.status !== "error"));

    try {
      await streamAssistantResponse(retryRequest);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStopGeneration = () => {
    stopRequestedRef.current = true;
    abortControllerRef.current?.abort();
    activeReaderRef.current?.cancel().catch(() => {});
    setIsGenerating(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return {
    messages,
    inputValue,
    isGenerating,
    chatError,
    retryRequest,
    messagesAreaRef,
    messagesEndRef,
    setInputValue,
    handleMessagesScroll,
    loadConversationMessages,
    handleNewChat,
    handleSend,
    handleRetry,
    handleStopGeneration,
    handleKeyDown,
    attachments,
    isUploading: attachments.some((att) => att.status === "uploading"),
    onFileSelect: handleFileSelect,
    onRemoveAttachment: handleRemoveAttachment,
  };
}
