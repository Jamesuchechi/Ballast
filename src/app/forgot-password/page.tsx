"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, ArrowRight, ShieldCheck, FileText, Sparkles, CheckCircle2 } from "lucide-react";
import { AuthSidebar } from "@/components/auth/AuthSidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || "Failed to send reset link");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container" style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}>
      {/* Left Readonly Side */}
      <AuthSidebar
        headline={
          <>
            Recover your
            <br />
            Ballast access.
          </>
        }
        description="We'll send you a secure password reset link to regain access to your personal briefing OS."
        features={[
          { icon: ShieldCheck, label: "Encrypted session tokens" },
          { icon: FileText, label: "Workspace access verification" },
          { icon: Sparkles, label: "Zero plain-text credential leaks" },
        ]}
      />

      {/* Right Form Side */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: "100vh",
          padding: "24px 20px 32px",
          position: "relative",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            maxWidth: "420px",
            margin: "0 auto",
          }}
        >
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--text-muted)",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to sign in</span>
          </Link>

          <ThemeToggle />
        </div>

        {/* Form Container */}
        <div
          style={{
            width: "100%",
            maxWidth: "380px",
            margin: "40px auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "var(--text)",
                marginBottom: "6px",
              }}
            >
              Reset your password
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Enter your work email address and we'll send you a link to reset your password.
            </p>
          </div>

          {submitted ? (
            <div
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "12px",
                padding: "24px 20px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <CheckCircle2 size={32} color="#22c55e" />
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "1rem" }}>
                Reset link sent
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                If an account exists for <strong style={{ color: "var(--text)" }}>{email}</strong>, you will receive password reset instructions shortly.
              </p>
              <Link
                href="/login"
                style={{
                  marginTop: "8px",
                  color: "var(--accent-text)",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  textDecoration: "none",
                }}
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }} noValidate>
              {error && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    color: "#ef4444",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    textAlign: "center",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label
                  htmlFor="email"
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                  }}
                >
                  Email address
                </label>
                <div style={{ position: "relative" }}>
                  <Mail
                    size={16}
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-subtle)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    style={{
                      width: "100%",
                      height: "44px",
                      paddingLeft: "42px",
                      paddingRight: "14px",
                      borderRadius: "10px",
                      background: "var(--input-bg)",
                      border: "1px solid var(--card-border)",
                      color: "var(--text)",
                      fontSize: "0.92rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  height: "44px",
                  borderRadius: "10px",
                  background: "var(--btn-cta-bg)",
                  color: "var(--btn-cta-text)",
                  border: "none",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: submitting ? "not-allowed" : "pointer",
                  marginTop: "6px",
                  boxShadow: "var(--btn-cta-shadow)",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Sending link..." : "Send reset link"}
                {!submitting && <ArrowRight size={16} />}
              </button>
            </form>
          )}

          <p style={{ textAlign: "center", fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Remember your password?{" "}
            <Link
              href="/login"
              style={{
                color: "var(--accent-text)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
          </p>
        </div>

        <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-subtle)" }}>
          Protected by Ballast OS citation & grounding security.
        </div>
      </div>
    </div>
  );
}
