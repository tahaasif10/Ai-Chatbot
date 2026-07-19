"use client";

import { useCallback, useEffect, useRef } from "react";

const STREAM_FRAME_MS = 16;
const STREAM_BASE_CHARS_PER_FRAME = 8;
const STREAM_FAST_CHARS_PER_FRAME = 18;
const STREAM_FAST_QUEUE_THRESHOLD = 240;

export default function useSmoothStream({ setMessages, scrollToBottom }) {
  const smoothQueueRef = useRef("");
  const smoothFrameRef = useRef(null);
  const smoothMessageIdRef = useRef(null);
  const lastStreamPaintRef = useRef(0);
  const runSmoothStreamRef = useRef(null);

  const paintStreamText = useCallback(
    (botMessageId, text, status = "streaming") => {
      if (!text) return;

      setMessages((prev) =>
        prev.map((message) =>
          message.id === botMessageId
            ? {
                ...message,
                text: `${message.text}${text}`,
                status,
              }
            : message
        )
      );

      requestAnimationFrame(() => scrollToBottom("auto"));
    },
    [scrollToBottom, setMessages]
  );

  const runSmoothStream = useCallback(
    (timestamp) => {
      const botMessageId = smoothMessageIdRef.current;

      if (!botMessageId) {
        smoothFrameRef.current = null;
        return;
      }

      if (
        lastStreamPaintRef.current &&
        timestamp - lastStreamPaintRef.current < STREAM_FRAME_MS
      ) {
        smoothFrameRef.current = requestAnimationFrame((nextTimestamp) =>
          runSmoothStreamRef.current?.(nextTimestamp)
        );
        return;
      }

      lastStreamPaintRef.current = timestamp;

      const queueLength = smoothQueueRef.current.length;
      const charsThisFrame =
        queueLength > STREAM_FAST_QUEUE_THRESHOLD
          ? STREAM_FAST_CHARS_PER_FRAME
          : STREAM_BASE_CHARS_PER_FRAME;
      const nextText = smoothQueueRef.current.slice(0, charsThisFrame);
      smoothQueueRef.current = smoothQueueRef.current.slice(charsThisFrame);

      paintStreamText(botMessageId, nextText);

      if (smoothQueueRef.current) {
        smoothFrameRef.current = requestAnimationFrame((nextTimestamp) =>
          runSmoothStreamRef.current?.(nextTimestamp)
        );
      } else {
        smoothFrameRef.current = null;
      }
    },
    [paintStreamText]
  );

  useEffect(() => {
    runSmoothStreamRef.current = runSmoothStream;
  }, [runSmoothStream]);

  const enqueueStreamText = useCallback(
    (botMessageId, chunk) => {
      if (!chunk) return;

      smoothMessageIdRef.current = botMessageId;
      smoothQueueRef.current += chunk;

      if (!smoothFrameRef.current) {
        smoothFrameRef.current = requestAnimationFrame((timestamp) =>
          runSmoothStreamRef.current?.(timestamp)
        );
      }
    },
    []
  );

  const flushStreamQueue = useCallback(
    (botMessageId, status = "streaming") => {
      if (smoothFrameRef.current) {
        cancelAnimationFrame(smoothFrameRef.current);
        smoothFrameRef.current = null;
      }

      const remainingText = smoothQueueRef.current;
      smoothQueueRef.current = "";
      smoothMessageIdRef.current = null;
      lastStreamPaintRef.current = 0;

      paintStreamText(botMessageId, remainingText, status);
    },
    [paintStreamText]
  );

  const waitForSmoothStream = useCallback((botMessageId) => {
    return new Promise((resolve) => {
      const checkQueue = () => {
        if (
          smoothMessageIdRef.current !== botMessageId ||
          (!smoothQueueRef.current && !smoothFrameRef.current)
        ) {
          resolve();
          return;
        }

        requestAnimationFrame(checkQueue);
      };

      checkQueue();
    });
  }, []);

  const resetSmoothStream = useCallback(() => {
    smoothQueueRef.current = "";
    smoothMessageIdRef.current = null;
    lastStreamPaintRef.current = 0;
  }, []);

  const cancelSmoothStream = useCallback(() => {
    if (smoothFrameRef.current) {
      cancelAnimationFrame(smoothFrameRef.current);
      smoothFrameRef.current = null;
    }
  }, []);

  return {
    enqueueStreamText,
    flushStreamQueue,
    waitForSmoothStream,
    resetSmoothStream,
    cancelSmoothStream,
  };
}
