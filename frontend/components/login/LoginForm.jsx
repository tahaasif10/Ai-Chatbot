"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import styles from "@/components/login/login.module.css";

function getNextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  return next && next.startsWith("/") ? next : "/";
}

const ease = [0.22, 1, 0.36, 1];

export default function LoginForm() {
  const supabase = createClient();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = mode === "signup";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const authResponse = isSignup
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (authResponse.error) {
        setError(authResponse.error.message || "Authentication failed.");
        return;
      }

      if (isSignup && !authResponse.data.session) {
        setError("Check your email to confirm your account, then log in.");
        setMode("login");
        return;
      }

      window.location.href = getNextPath();
    } catch {
      setError("Could not reach the auth service.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const setAuthMode = (nextMode) => {
    setMode(nextMode);
    setError("");
  };

  return (
    <main className={styles.page}>
      <motion.section
        className={styles.panel}
        initial={{ opacity: 0, y: 28, scale: 0.97, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.65, ease }}
      >
        <div className={styles.ambientGlow} aria-hidden="true" />
        <div className={styles.glowOrb1} aria-hidden="true" />
        <div className={styles.glowOrb2} aria-hidden="true" />
        <div className={styles.glowOrb3} aria-hidden="true" />

        <motion.div
          className={styles.logoSection}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
        >
          <div className={styles.logoEmblem}>
            <div className={styles.logoRing} aria-hidden="true" />
            <svg
              className={styles.logoIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                width: 32,
                height: 32,
                color: "#4facfe",
                position: "relative",
                zIndex: 1,
              }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className={styles.brandLabel}>Ai-Study</span>
          <span className={styles.brandTagline}>Smarter study support</span>
        </motion.div>

        <motion.div
          className={styles.header}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18, ease }}
        >
          <h1 className={styles.title}>
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className={styles.subtitle}>
            {isSignup
              ? "Sign up to start learning with your study assistant."
              : "Log in to continue learning with your study assistant."}
          </p>
        </motion.div>

        <motion.div
          className={styles.modeTabs}
          role="tablist"
          aria-label="Auth mode"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.24, ease }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={`${styles.modeTab} ${!isSignup ? styles.modeTabActive : ""}`}
            onClick={() => setAuthMode("login")}
          >
            {!isSignup ? (
              <motion.span
                layoutId="authModeIndicator"
                className={styles.modeIndicator}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <span className={styles.modeTabLabel}>Log in</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={`${styles.modeTab} ${isSignup ? styles.modeTabActive : ""}`}
            onClick={() => setAuthMode("signup")}
          >
            {isSignup ? (
              <motion.span
                layoutId="authModeIndicator"
                className={styles.modeIndicator}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <span className={styles.modeTabLabel}>Sign up</span>
          </button>
        </motion.div>

        <motion.form
          className={styles.form}
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3, ease }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Password</span>
            <input
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              minLength={isSignup ? 8 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <AnimatePresence mode="wait">
            {error ? (
              <motion.p
                key="auth-error"
                className={styles.error}
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.25, ease }}
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <motion.button
            className={styles.submitBtn}
            disabled={isSubmitting}
            whileHover={isSubmitting ? undefined : { y: -2 }}
            whileTap={isSubmitting ? undefined : { scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
          >
            <span className={styles.submitBtnGlow} aria-hidden="true" />
            <span className={styles.submitBtnText}>
              {isSubmitting
                ? "Please wait..."
                : isSignup
                  ? "Create account"
                  : "Log in"}
            </span>
          </motion.button>
        </motion.form>

        <motion.div
          className={styles.footer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.38, ease }}
        >
          <p className={styles.footerText}>
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              className={styles.switchBtn}
              type="button"
              onClick={() => setAuthMode(isSignup ? "login" : "signup")}
            >
              {isSignup ? "Log in" : "Sign up"}
            </button>
          </p>
        </motion.div>
      </motion.section>
    </main>
  );
}
