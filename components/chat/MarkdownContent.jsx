"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import styles from "@/components/chatbot.module.css";

const HEADING_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

function looksLikePlainTextHeading(lines, index) {
  const line = lines[index];
  const trimmed = line.trim();
  const previousLine = lines[index - 1]?.trim() || "";
  const nextLine = lines[index + 1]?.trim() || "";
  const nextContentLine = lines.slice(index + 1).find((item) => item.trim());

  if (
    !trimmed ||
    previousLine ||
    nextLine ||
    !nextContentLine ||
    trimmed.length > 70 ||
    /[.!?;:,)]$/.test(trimmed) ||
    /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\||```)/.test(trimmed)
  ) {
    return false;
  }

  const words = trimmed.match(/[A-Za-z][A-Za-z'-]*/g) || [];

  if (words.length === 0 || words.length > 9) {
    return false;
  }

  const meaningfulWords = words.filter(
    (word) => !HEADING_STOP_WORDS.has(word.toLowerCase())
  );

  if (meaningfulWords.length === 0) {
    return true;
  }

  const titleCaseWords = meaningfulWords.filter((word) =>
    /^[A-Z0-9]/.test(word)
  );

  return titleCaseWords.length / meaningfulWords.length >= 0.65;
}

function formatAssistantMarkdown(content) {
  const lines = content.split(/\r?\n/);
  let inCodeFence = false;

  return lines
    .map((line, index) => {
      if (line.trim().startsWith("```")) {
        inCodeFence = !inCodeFence;
        return line;
      }

      if (inCodeFence || !looksLikePlainTextHeading(lines, index)) {
        return line;
      }

      return `${index === 0 ? "#" : "##"} ${line.trim()}`;
    })
    .join("\n");
}

export default function MarkdownContent({ content }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children, ...props }) => {
            const codeElement = React.Children.toArray(children).find(
              (child) => React.isValidElement(child) && child.type === "code"
            );
            const className = codeElement?.props?.className || "";
            const match = /language-(\w+)/.exec(className);
            const language = match ? match[1] : "";

            return (
              <pre className={styles.codeBlock} {...props}>
                {language && (
                  <span className={styles.codeLanguage}>{language}</span>
                )}
                {children}
              </pre>
            );
          },
        }}
      >
        {formatAssistantMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
