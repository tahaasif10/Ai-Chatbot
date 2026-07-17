"use client";

import styles from "@/components/chatbot.module.css";

export default function ConversationItem({
  conversation,
  isActive,
  isDisabled,
  onSelect,
}) {
  return (
    <button
      className={`${styles.historyItem} ${
        isActive ? styles.activeHistoryItem : ""
      }`}
      onClick={() => onSelect(conversation.id)}
      disabled={isDisabled}
      title={conversation.title}
    >
      {conversation.title}
    </button>
  );
}
