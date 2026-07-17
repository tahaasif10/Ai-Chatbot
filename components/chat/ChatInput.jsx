"use client";

import { useEffect, useRef } from "react";
import styles from "@/components/chatbot.module.css";

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ChatInput({
  inputValue,
  isGenerating,
  isDisabled = false,
  variant = "bottom",
  onInputChange,
  onKeyDown,
  onSend,
  onStopGeneration,
  attachments = [],
  onFileSelect,
  onRemoveAttachment,
  isUploading = false,
}) {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const isInputDisabled = isGenerating || isDisabled;

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      onFileSelect(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const isSendDisabled =
    isDisabled ||
    (!inputValue.trim() && attachments.length === 0) ||
    isUploading;

  const isBottomVariant = variant === "bottom";
  const containerClass = isBottomVariant
    ? `${styles.inputContainer} ${styles.inputContainerBottom}`
    : `${styles.inputContainer} ${styles.inputContainerCentered}`;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [inputValue]);

  const input = (
    <div className={containerClass}>
      <div className={styles.inputWrapper}>
        {attachments.length > 0 && (
          <div className={styles.previewsContainer}>
            {attachments.map((file) => (
              <div
                key={file.id}
                className={`${styles.previewItem} ${
                  file.error ? styles.previewItemError : ""
                }`}
              >
                {file.type?.startsWith("image/") && file.url ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    className={styles.previewThumbnail}
                  />
                ) : (
                  <div className={styles.previewDocIcon}>
                    {file.name.split(".").pop()?.toUpperCase() || "DOC"}
                  </div>
                )}
                <div className={styles.previewInfo}>
                  <div className={styles.previewName} title={file.name}>
                    {file.name}
                  </div>
                  <div className={styles.previewSize}>
                    {file.status === "uploading"
                      ? "Uploading..."
                      : file.error
                      ? "Error"
                      : formatSize(file.size)}
                  </div>
                </div>
                {file.status === "uploading" ? (
                  <div className={styles.previewSpinner} />
                ) : (
                  <button
                    className={styles.previewRemove}
                    onClick={() => onRemoveAttachment(file.id)}
                    aria-label="Remove attachment"
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className={styles.inputField}
          placeholder={
            isDisabled
              ? "You have exceeded your limits. Try again later."
              : "Message AI chat..."
          }
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isInputDisabled}
          rows={1}
        />

        <div className={styles.inputToolbar}>
          <div className={styles.toolbarLeft}>
            <button
              className={styles.attachBtn}
              onClick={triggerFileInput}
              disabled={isInputDisabled}
              type="button"
              aria-label="Attach file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true">
                <path d="M419.5 96c-16.6 0-32.7 4.5-46.8 12.7-15.8-16-34.2-29.4-54.5-39.5 28.2-24 64.1-37.2 101.3-37.2 86.4 0 156.5 70 156.5 156.5 0 41.5-16.5 81.3-45.8 110.6l-71.1 71.1c-29.3 29.3-69.1 45.8-110.6 45.8-86.4 0-156.5-70-156.5-156.5 0-1.5 0-3 .1-4.5 .5-17.7 15.2-31.6 32.9-31.1s31.6 15.2 31.1 32.9c0 .9 0 1.8 0 2.6 0 51.1 41.4 92.5 92.5 92.5 24.5 0 48-9.7 65.4-27.1l71.1-71.1c17.3-17.3 27.1-40.9 27.1-65.4 0-51.1-41.4-92.5-92.5-92.5zM275.2 173.3c-1.9-.8-3.8-1.9-5.5-3.1-12.6-6.5-27-10.2-42.1-10.2-24.5 0-48 9.7-65.4 27.1L91.1 258.2c-17.3 17.3-27.1 40.9-27.1 65.4 0 51.1 41.4 92.5 92.5 92.5 16.5 0 32.6-4.4 46.7-12.6 15.8 16 34.2 29.4 54.6 39.5-28.2 23.9-64 37.2-101.3 37.2-86.4 0-156.5-70-156.5-156.5 0-41.5 16.5-81.3 45.8-110.6l71.1-71.1c29.3-29.3 69.1-45.8 110.6-45.8 86.6 0 156.5 70.6 156.5 156.9 0 1.3 0 2.6 0 3.9-.4 17.7-15.1 31.6-32.8 31.2s-31.6-15.1-31.2-32.8c0-.8 0-1.5 0-2.3 0-33.7-18-63.3-44.8-79.6z" />
              </svg>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              multiple
              onChange={handleFileChange}
              disabled={isInputDisabled}
              accept="image/*,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
          </div>

          <div className={styles.toolbarRight}>
            {isGenerating ? (
              <button
                className={styles.stopBtn}
                aria-label="Stop generation"
                onClick={onStopGeneration}
                type="button"
              >
                Stop
              </button>
            ) : (
              <button
                className={styles.sendBtn}
                aria-label="Send message"
                onClick={onSend}
                disabled={isSendDisabled}
                type="button"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 4l-7 7h4v9h6v-9h4z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!isBottomVariant) {
    return input;
  }

  return (
    <div className={styles.composerDock}>
      <div className={styles.composerFade} aria-hidden="true" />
      {input}
    </div>
  );
}
