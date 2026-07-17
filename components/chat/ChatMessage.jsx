"use client";

import { memo } from "react";
import MarkdownContent from "./MarkdownContent";
import ThinkingIndicator from "./ThinkingIndicator";
import styles from "@/components/chatbot.module.css";

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const AttachmentItem = ({ attachment }) => {
  const isImage = attachment.type?.startsWith("image/");

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        title="Open full image in new tab"
      >
        <img
          src={attachment.url}
          alt={attachment.name || "Attachment"}
          className={styles.bubbleAttachmentImage}
        />
      </a>
    );
  }

  const fileExt = attachment.name?.split(".").pop()?.toUpperCase() || "DOC";
  const icon = fileExt === "PDF" ? "📄" : "📝";

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.bubbleAttachmentCard}
      title={`Download ${attachment.name}`}
    >
      <span className={styles.cardIcon}>{icon}</span>
      <div className={styles.cardInfo}>
        <div className={styles.cardName} title={attachment.name}>
          {attachment.name}
        </div>
        <div className={styles.cardSize}>{formatSize(attachment.size)}</div>
      </div>
    </a>
  );
};

const ChatMessage = memo(function ChatMessage({ message }) {
  if (message.role === "user") {
    return (
      <div className={`${styles.messageRow} ${styles.userRow}`}>
        <div className={`${styles.avatar} ${styles.userAvatar}`}>You</div>
        <div className={`${styles.bubble} ${styles.userBubble}`}>
          {message.text}
          {message.attachments && message.attachments.length > 0 && (
            <div className={styles.bubbleAttachments}>
              {message.attachments.map((att) => (
                <AttachmentItem key={att.id || att.url} attachment={att} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isWaiting = message.status === "thinking" && !message.text;

  return (
    <div className={styles.messageRow}>
      <div className={`${styles.avatar} ${styles.botAvatar}`}>AI</div>
      <div
        className={`${styles.bubble} ${styles.botBubble} ${
          isWaiting ? styles.typingBubble : ""
        } ${message.status === "error" ? styles.partialBubble : ""}`}
      >
        {isWaiting ? (
          <ThinkingIndicator />
        ) : (
          <>
            <MarkdownContent content={message.text} />
            {message.attachments && message.attachments.length > 0 && (
              <div className={styles.bubbleAttachments}>
                {message.attachments.map((att) => (
                  <AttachmentItem key={att.id || att.url} attachment={att} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
