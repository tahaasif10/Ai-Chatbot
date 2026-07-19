"use client";

import { useState } from "react";
import MarkdownContent from "@/components/chat/MarkdownContent";
import styles from "./studyTools.module.css";

function FlashcardDeck({ cards }) {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!cards || cards.length === 0) {
    return <p className={styles.emptyState}>No flashcards were generated.</p>;
  }

  const card = cards[index];

  const goTo = (nextIndex) => {
    setIsFlipped(false);
    setIndex(nextIndex);
  };

  return (
    <div className={styles.deck}>
      <div className={styles.deckHeader}>
        <span>Card {index + 1} of {cards.length}</span>
      </div>

      <button
        type="button"
        className={`${styles.flashcard} ${isFlipped ? styles.flashcardFlipped : ""}`}
        onClick={() => setIsFlipped((v) => !v)}
        aria-label="Flip flashcard"
      >
        <div className={styles.flashcardInner}>
          <div className={styles.flashcardFace}>
            <span className={styles.flashcardLabel}>Front</span>
            <p>{card.front}</p>
          </div>
          <div className={`${styles.flashcardFace} ${styles.flashcardFaceBack}`}>
            <span className={styles.flashcardLabel}>Back</span>
            <p>{card.back}</p>
          </div>
        </div>
      </button>

      <p className={styles.tapHint}>Tap the card to flip it</p>

      <div className={styles.deckNav}>
        <button type="button" onClick={() => goTo(Math.max(0, index - 1))} disabled={index === 0} className={styles.navBtn}>
          Previous
        </button>
        <button type="button" onClick={() => goTo(Math.min(cards.length - 1, index + 1))} disabled={index === cards.length - 1} className={styles.navBtn}>
          Next
        </button>
      </div>
    </div>
  );
}

function QuizList({ questions }) {
  const [revealed, setRevealed] = useState({});
  const [selected, setSelected] = useState({});

  if (!questions || questions.length === 0) {
    return <p className={styles.emptyState}>No quiz questions were generated.</p>;
  }

  const selectOption = (questionIndex, option) => {
    if (revealed[questionIndex]) return;
    setSelected((prev) => ({ ...prev, [questionIndex]: option }));
    setRevealed((prev) => ({ ...prev, [questionIndex]: true }));
  };

  return (
    <div className={styles.quizList}>
      {questions.map((q, qIndex) => {
        const isRevealed = Boolean(revealed[qIndex]);
        const selectedOption = selected[qIndex];

        return (
          <div key={qIndex} className={styles.quizCard}>
            <p className={styles.quizQuestion}>{qIndex + 1}. {q.question}</p>

            <div className={styles.quizOptions}>
              {(q.options || []).map((option, oIndex) => {
                const isCorrect = option === q.correctAnswer;
                const isSelected = option === selectedOption;

                let optionClass = styles.quizOption;
                if (isRevealed && isCorrect) optionClass += ` ${styles.quizOptionCorrect}`;
                if (isRevealed && isSelected && !isCorrect) optionClass += ` ${styles.quizOptionWrong}`;

                return (
                  <button key={oIndex} type="button" className={optionClass} onClick={() => selectOption(qIndex, option)} disabled={isRevealed}>
                    {option}
                  </button>
                );
              })}
            </div>

            {isRevealed && q.explanation ? <p className={styles.quizExplanation}>{q.explanation}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function StudyToolsModal({ isOpen, mode, isLoading, error, result, sourceName, onClose }) {
  if (!isOpen) return null;

  const titleByMode = { flashcards: "Flashcards", quiz: "Practice Quiz", summary: "Summary" };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{titleByMode[mode] || "Study Tools"}</h2>
            <p className={styles.modalSubtitle} title={sourceName}>From {sourceName}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.modalBody}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Generating {titleByMode[mode]?.toLowerCase() || "study material"}...</p>
            </div>
          ) : error ? (
            <p className={styles.errorState}>{error}</p>
          ) : mode === "flashcards" ? (
            <FlashcardDeck cards={result} />
          ) : mode === "quiz" ? (
            <QuizList questions={result} />
          ) : mode === "summary" ? (
            <div className={styles.summaryContent}>
              <MarkdownContent content={result || ""} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}