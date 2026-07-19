"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConversationList from "./ConversationList";
import SidebarPanelIcon from "./SidebarPanelIcon";
import styles from "@/components/chatbot.module.css";

const DEFAULT_MESSAGE_LIMIT = 20;
const DEFAULT_TOKEN_LIMIT = 50000;

/* ─── helpers ─────────────────────────────────────────────────── */

function getInitials(email) {
  if (!email) return "?";
  return email[0].toUpperCase();
}

function getUsageTone(value, limit) {
  if (!limit) return styles.usageOk;
  const ratio = value / limit;
  if (ratio >= 1) return styles.usageDanger;
  if (ratio >= 0.8) return styles.usageWarn;
  return styles.usageOk;
}

/* ─── UsageMeter (used inside modal) ──────────────────────────── */

function UsageMeter({ label, value, limit, unit }) {
  const percent = limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  const toneClass = getUsageTone(value, limit);

  return (
    <div className={styles.usageMeter}>
      <div className={styles.usageMeterHeader}>
        <span>{label}</span>
        <span>
          {value.toLocaleString()} / {limit.toLocaleString()} {unit}
        </span>
      </div>
      <div className={styles.usageTrack}>
        <div
          className={`${styles.usageBar} ${toneClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/* ─── UserFooter ───────────────────────────────────────────────── */

function UserFooter({ user, usage, onLogout }) {
  const [open, setOpen] = useState(false);
  const footerRef = useRef(null);
  const modalRef = useRef(null);

  const email = user?.email ?? "—";
  const messageCount = usage?.messageCount || 0;
  const totalTokensUsed = usage?.totalTokensUsed || 0;
  const messageLimit = usage?.messageLimit || DEFAULT_MESSAGE_LIMIT;
  const tokenLimit = usage?.tokenLimit || DEFAULT_TOKEN_LIMIT;

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target) &&
        footerRef.current &&
        !footerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={styles.userFooterWrapper}>
      {/* Glass modal — always in DOM so it can animate */}
      <div
        ref={modalRef}
        className={`${styles.userModal} ${open ? styles.userModalOpen : ""}`}
        aria-hidden={!open}
      >
        {/* email row */}
        <div className={styles.userModalEmail}>
          <div className={styles.userModalAvatar}>{getInitials(email)}</div>
          <span className={styles.userModalEmailText} title={email}>
            {email}
          </span>
        </div>

        <div className={styles.userModalDivider} />

        {/* usage */}
        <div className={styles.userModalSection}>
          <div className={styles.userModalSectionLabel}>Usage</div>
          <UsageMeter
            label="Messages"
            value={messageCount}
            limit={messageLimit}
            unit="msg"
          />
          <UsageMeter
            label="Tokens"
            value={totalTokensUsed}
            limit={tokenLimit}
            unit="tok"
          />
        </div>

        <div className={styles.userModalDivider} />

        {/* logout */}
        <button
          className={styles.userModalLogout}
          onClick={() => {
            setOpen(false);
            onLogout?.();
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </button>
      </div>

      {/* Chip button */}
      <button
        ref={footerRef}
        className={`${styles.userFooterBtn} ${open ? styles.userFooterBtnActive : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={email}
      >
        <div className={styles.userFooterAvatar}>{getInitials(email)}</div>
        <span className={styles.userFooterEmail}>{email}</span>
        <svg
          className={`${styles.userFooterChevron} ${open ? styles.userFooterChevronUp : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Sidebar ──────────────────────────────────────────────────── */

export default function Sidebar({
  conversations,
  activeConversationId,
  isHistoryLoading,
  isConversationLoading,
  historyError,
  isGenerating,
  usage,
  user,
  isOpen = true,
  onClose,
  onNewChat,
  onLogout,
  onSelectConversation,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      (conversation.title || "").toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  return (
    <aside
      className={`${styles.sidebar} ${!isOpen ? styles.sidebarCollapsed : ""}`}
      aria-hidden={!isOpen}
    >
      <div className={styles.sidebarHeader}>
        <div className={styles.brand}>
          <span className={styles.brandText}>AI Study Assistant</span>
        </div>
        <button
          type="button"
          className={styles.sidebarToggleBtn}
          onClick={onClose}
          aria-label="Close sidebar"
          title="Close sidebar"
        >
          <SidebarPanelIcon />
        </button>
      </div>

      <button
        className={styles.newChatBtn}
        onClick={onNewChat}
        disabled={isGenerating}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Study Chat
      </button>

      <div className={styles.searchBar}>
        <svg
          className={styles.searchIcon}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className={styles.searchField}
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search chats"
        />
        {searchQuery && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div className={styles.historySection}>
        <div className={styles.historyTitle}>Recent</div>
        <div className={styles.historyList}>
          <ConversationList
            conversations={filteredConversations}
            searchQuery={searchQuery}
            activeConversationId={activeConversationId}
            isHistoryLoading={isHistoryLoading}
            isConversationLoading={isConversationLoading}
            historyError={historyError}
            isGenerating={isGenerating}
            onSelectConversation={onSelectConversation}
          />
        </div>
      </div>

      <UserFooter user={user} usage={usage} onLogout={onLogout} />
    </aside>
  );
}
