"use client";

import styles from "./studyTools.module.css";

export default function StudyToolsButtons({ attachment, onFlashcards, onQuiz, onSummary }) {
  if (!attachment.extractedText) return null;

  return (
    <div className={styles.toolsRow}>
      <button type="button" className={styles.toolBtn} onClick={() => onFlashcards(attachment)}>
        🗂️ Flashcards
      </button>
      <button type="button" className={styles.toolBtn} onClick={() => onQuiz(attachment)}>
        📝 Quiz
      </button>
      <button type="button" className={styles.toolBtn} onClick={() => onSummary(attachment)}>
        📋 Summarize
      </button>
    </div>
  );
}