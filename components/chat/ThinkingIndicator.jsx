"use client";

import styles from "@/components/chatbot.module.css";

export default function ThinkingIndicator() {
  return (
    <div className={styles.thinkingIndicator}>
      <span>AI is thinking</span>
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </div>
  );
}
