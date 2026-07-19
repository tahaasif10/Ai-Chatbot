"use client";

import ConversationItem from "./ConversationItem";
import styles from "@/components/chatbot.module.css";

export default function ConversationList({
  conversations,
  searchQuery = "",
  activeConversationId,
  isHistoryLoading,
  isConversationLoading,
  historyError,
  isGenerating,
  onSelectConversation,
}) {
  if (isHistoryLoading) {
    return <div className={styles.historyState}>Loading history...</div>;
  }

  if (historyError) {
    return <div className={styles.historyState}>{historyError}</div>;
  }

  if (conversations.length === 0) {
    const emptyMessage = searchQuery.trim()
      ? "No chats match your search."
      : "No saved chats yet.";
    return <div className={styles.historyState}>{emptyMessage}</div>;
  }

  return conversations.map((conversation) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      isActive={conversation.id === activeConversationId}
      isDisabled={isGenerating || isConversationLoading}
      onSelect={onSelectConversation}
    />
  ));
}
