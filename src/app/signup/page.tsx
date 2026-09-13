"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Anchor, ArrowLeft, ArrowRight, ShieldCheck, FileText, Sparkles } from "lucide-react";
import { AuthSidebar } from "@/components/auth/AuthSidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const msg = params.get("message");
      const err = params.get("error");
      if (msg) {
        setError(msg);
      } else if (err) {
        setError(`Sign up failed: ${err.replace(/_/g, " ")}`);
      }
    }
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required";
    else if (name.trim().length < 2) errs.name = "Name must be at least 2 characters";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = "Please enter a valid email address";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleGoogleSignIn = () => {
    setSubmitting(true);
    setError("");
    const fromPath =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("from") || "/app"
        : "/app";
    window.location.href = `/api/auth/google?from=${encodeURIComponent(fromPath)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create account");
      }
      const fromPath =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("from") || "/app"
          : "/app";
      router.push(fromPath);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container" style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}>
      {/* Left Readonly Side (Hidden on mobile via .auth-sidebar) */}
      <AuthSidebar
        headline={
          <>
            Grounded briefs
            <br />
            from your sources.
          </>
        }
        description="Join teams using Ballast to trade messy chat threads and endless tabs for dated, citable closure. If it cannot cite, it does not state."
        features={[
          { icon: ShieldCheck, label: "Strict quote citation gating" },
          { icon: FileText, label: "Deterministic Markdown & PDF export" },
          { icon: Sparkles, label: "Zero execution without explicit sign-off" },
        ]}
      />

      {/* Right Form Side (Only side visible on mobile) */}
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
        {/* Top bar: Back link + Theme Toggle */}
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
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--text-muted)",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 500,
              transition: "color 0.15s ease",
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to home</span>
          </Link>

          <ThemeToggle />
        </div>

        {/* Center: Auth Form Container */}
        <div
          style={{
            width: "100%",
            maxWidth: "380px",
            margin: "36px auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {/* Mobile brand header (shown only when sidebar is hidden) */}
          <div className="mobile-only" style={{ marginBottom: "4px" }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--text)",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "1.1rem",
              }}
            >
              <Anchor size={20} color="var(--accent)" strokeWidth={2.4} />
              <span>Ballast</span>
            </Link>
          </div>

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
              Create your account
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Get started with citation-gated briefs in seconds
            </p>
          </div>

          {/* Google Sign-in Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            style={{
              width: "100%",
              height: "44px",
              borderRadius: "10px",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              color: "var(--text)",
              fontSize: "0.92rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              cursor: "pointer",
              boxShadow: "var(--card-shadow)",
              transition: "all 0.15s ease",
            }}
          >
            <svg style={{ width: "18px", height: "18px" }} viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              color: "var(--text-subtle)",
              fontSize: "0.78rem",
            }}
          >
            <div style={{ flex: 1, height: "1px", background: "var(--card-border)" }} />
            <span>or continue with email</span>
            <div style={{ flex: 1, height: "1px", background: "var(--card-border)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }} noValidate>
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

            {/* Name Field */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                htmlFor="name"
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                }}
              >
                Full name
              </label>
              <div style={{ position: "relative" }}>
                <User
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
                  id="name"
                  type="text"
                  placeholder="Alex Chen"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: "" }));
                  }}
                  style={{
                    width: "100%",
                    height: "44px",
                    paddingLeft: "42px",
                    paddingRight: "14px",
                    borderRadius: "10px",
                    background: "var(--input-bg)",
                    border: `1px solid ${fieldErrors.name ? "var(--danger)" : "var(--card-border)"}`,
                    color: "var(--text)",
                    fontSize: "0.92rem",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s ease",
                  }}
                />
              </div>
              {fieldErrors.name && (
                <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                  {fieldErrors.name}
                </span>
              )}
            </div>

            {/* Email Field */}
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
                Email
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
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" }));
                  }}
                  style={{
                    width: "100%",
                    height: "44px",
                    paddingLeft: "42px",
                    paddingRight: "14px",
                    borderRadius: "10px",
                    background: "var(--input-bg)",
                    border: `1px solid ${fieldErrors.email ? "var(--danger)" : "var(--card-border)"}`,
                    color: "var(--text)",
                    fontSize: "0.92rem",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s ease",
                  }}
                />
              </div>
              {fieldErrors.email && (
                <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                  {fieldErrors.email}
                </span>
              )}
            </div>

            {/* Password Field */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                htmlFor="password"
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
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
                  id="password"
                  type="password"
                  placeholder="8+ characters"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: "" }));
                  }}
                  style={{
                    width: "100%",
                    height: "44px",
                    paddingLeft: "42px",
                    paddingRight: "14px",
                    borderRadius: "10px",
                    background: "var(--input-bg)",
                    border: `1px solid ${fieldErrors.password ? "var(--danger)" : "var(--card-border)"}`,
                    color: "var(--text)",
                    fontSize: "0.92rem",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s ease",
                  }}
                />
              </div>
              {fieldErrors.password && (
                <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>
                  {fieldErrors.password}
                </span>
              )}
            </div>

            {/* Submit Button */}
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
                marginTop: "8px",
                boxShadow: "var(--btn-cta-shadow)",
                transition: "all 0.15s ease",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Creating workspace..." : "Create account"}
              {!submitting && <ArrowRight size={16} />}
            </button>
          </form>

          {/* Footer Toggle to Login */}
          <p style={{ textAlign: "center", fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Already have an account?{" "}
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

        {/* Bottom subtle note */}
        <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-subtle)" }}>
          By creating an account, you agree to the Terms of Service and Privacy Policy.
        </div>
      </div>
    </div>
  );
}
