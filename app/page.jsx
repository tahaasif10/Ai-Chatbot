"use client";

import ChatInput from "@/components/chat/ChatInput";
import ChatMessage from "@/components/chat/ChatMessage";
import Sidebar from "@/components/sidebar/Sidebar";
import SidebarPanelIcon from "@/components/sidebar/SidebarPanelIcon";
import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { createClient } from "@/lib/supabase-browser";
import useChat from "@/hooks/useChat";
import useConversations from "@/hooks/useConversations";
import styles from "@/components/chatbot.module.css";

const FALLBACK_MESSAGE_LIMIT = 20;
const FALLBACK_TOKEN_LIMIT = 50000;

export default function Home() {
  const supabase = createClient();
  const [usage, setUsage] = useState(null);
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
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
  } = useConversations();

  const fetchUsage = useCallback(async () => {
    const response = await authFetch("/api/user/usage");
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || "Could not load usage data.");
    }

    setUsage(data);
  }, []);

  useEffect(() => {
    // Detect mobile on mount to default sidebar to closed
    if (typeof window !== "undefined") {
      const isMobile = window.innerWidth < 768;
      setSidebarOpen(!isMobile);
    }

    // Fetch current user
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
    });

    const timeoutId = window.setTimeout(() => {
      fetchUsage().catch((error) => {
        console.error("Usage load failed:", error);
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchUsage, supabase]);

  const {
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
    onFileSelect,
    onRemoveAttachment,
    isUploading,
  } = useChat({
    activeConversationId,
    setActiveConversationId,
    setIsConversationLoading,
    createConversation,
    generateConversationTitle,
    touchConversation,
    onMessageCompleted: fetchUsage,
  });

  const messageLimit = usage?.messageLimit || FALLBACK_MESSAGE_LIMIT;
  const tokenLimit = usage?.tokenLimit || FALLBACK_TOKEN_LIMIT;
  const isRateLimited =
    (usage?.messageCount || 0) >= messageLimit ||
    (usage?.totalTokensUsed || 0) >= tokenLimit;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleSelectConversation = (id) => {
    loadConversationMessages(id);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleNewChatMobile = () => {
    handleNewChat();
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className={styles.container}>
      {sidebarOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        isHistoryLoading={isHistoryLoading}
        isConversationLoading={isConversationLoading}
        historyError={historyError}
        isGenerating={isGenerating}
        usage={usage}
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChatMobile}
        onLogout={handleLogout}
        onSelectConversation={handleSelectConversation}
      />

      <main
        className={`${styles.mainChat} ${
          messages.length > 0 ? styles.chatActive : ""
        }`}
      >
        <div className={styles.mobileHeader}>
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className={styles.mobileTitle}>AI Chatbot</span>
          <button
            type="button"
            className={styles.mobileNewChatBtn}
            onClick={handleNewChatMobile}
            aria-label="New Chat"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {!sidebarOpen ? (
          <button
            type="button"
            className={styles.sidebarOpenBtn}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            <SidebarPanelIcon />
          </button>
        ) : null}
        {chatError ? (
          <div className={styles.chatError}>
            <span>{chatError}</span>
            {retryRequest ? (
              <button className={styles.retryBtn} onClick={handleRetry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {isConversationLoading ? (
          <>
            <div className={styles.chatHistoryPlaceholder}>
              <p className={styles.subText}>Loading conversation...</p>
            </div>
            <ChatInput
              inputValue={inputValue}
              isGenerating={isGenerating}
              isDisabled={isRateLimited}
              onInputChange={setInputValue}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              onStopGeneration={handleStopGeneration}
              attachments={attachments}
              onFileSelect={onFileSelect}
              onRemoveAttachment={onRemoveAttachment}
              isUploading={isUploading}
            />
          </>
        ) : messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateHeader}>
              <h1 className={styles.welcomeText}>What&apos;s on your mind today?</h1>
            </div>
            <ChatInput
              variant="centered"
              inputValue={inputValue}
              isGenerating={isGenerating}
              isDisabled={isRateLimited}
              onInputChange={setInputValue}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              onStopGeneration={handleStopGeneration}
              attachments={attachments}
              onFileSelect={onFileSelect}
              onRemoveAttachment={onRemoveAttachment}
              isUploading={isUploading}
            />
          </div>
        ) : (
          <>
            <div
              ref={messagesAreaRef}
              className={styles.messagesScroll}
              onScroll={handleMessagesScroll}
            >
              <div className={styles.messagesArea}>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}

                <div ref={messagesEndRef} className={styles.messagesEnd} />
              </div>
            </div>
            <ChatInput
              inputValue={inputValue}
              isGenerating={isGenerating}
              isDisabled={isRateLimited}
              onInputChange={setInputValue}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              onStopGeneration={handleStopGeneration}
              attachments={attachments}
              onFileSelect={onFileSelect}
              onRemoveAttachment={onRemoveAttachment}
              isUploading={isUploading}
            />
          </>
        )}
      </main>
    </div>
  );
}
