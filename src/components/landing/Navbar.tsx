"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Anchor, Menu, X, ArrowRight, Terminal } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        width: "100%",
        backgroundColor: "var(--nav-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--card-border)",
        transition: "background-color 0.25s ease, border-color 0.25s ease",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          height: "68px",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/"
          onClick={() => setMobileMenuOpen(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "1.15rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "rgba(16, 185, 129, 0.14)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            <Anchor size={18} strokeWidth={2.4} />
          </div>
          <span>Ballast</span>
        </Link>

        {/* Desktop Navigation */}
        <nav
          className="desktop-only"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <a
            href="#how-it-works"
            style={{
              fontSize: "0.88rem",
              color: "var(--text-muted)",
              textDecoration: "none",
              fontWeight: 500,
              transition: "color 0.15s ease",
            }}
          >
            How it works
          </a>
          <a
            href="#comparison"
            style={{
              fontSize: "0.88rem",
              color: "var(--text-muted)",
              textDecoration: "none",
              fontWeight: 500,
              transition: "color 0.15s ease",
            }}
          >
            Why Ballast
          </a>
          <Link
            href="/app"
            style={{
              fontSize: "0.88rem",
              color: "var(--accent-text)",
              textDecoration: "none",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "6px",
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              transition: "all 0.15s ease",
            }}
          >
            <Terminal size={14} />
            <span>Dashboard</span>
          </Link>
          <Link
            href="/login"
            style={{
              fontSize: "0.88rem",
              color: "var(--text-muted)",
              textDecoration: "none",
              fontWeight: 500,
              transition: "color 0.15s ease",
            }}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            style={{
              background: "var(--btn-cta-bg)",
              color: "var(--btn-cta-text)",
              fontSize: "0.85rem",
              fontWeight: 600,
              padding: "8px 18px",
              borderRadius: "8px",
              textDecoration: "none",
              boxShadow: "var(--btn-cta-shadow)",
              transition: "all 0.15s ease",
            }}
          >
            Get started
          </Link>
          <ThemeToggle />
        </nav>

        {/* Mobile Actions: ThemeToggle + Hamburger */}
        <div
          className="mobile-only"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            style={{
              minWidth: "44px",
              minHeight: "44px",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--card-bg-subtle)",
              border: "1px solid var(--card-border)",
              color: "var(--text)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down Navigation Panel */}
      {mobileMenuOpen && (
        <div
          style={{
            position: "absolute",
            top: "68px",
            left: 0,
            right: 0,
            background: "var(--card-bg)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderBottom: "1px solid var(--card-border)",
            padding: "20px 16px 28px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            zIndex: 100,
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
            animation: "heroFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: "1rem",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 500,
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            How it works
          </a>
          <a
            href="#comparison"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: "1rem",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 500,
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            Why Ballast
          </a>
          <Link
            href="/app"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: "1rem",
              color: "var(--accent-text)",
              textDecoration: "none",
              fontWeight: 600,
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "0 8px",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            <Terminal size={16} />
            <span>Open Dashboard Console</span>
          </Link>
          <Link
            href="/login"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: "1rem",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 500,
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              marginTop: "6px",
              background: "var(--btn-cta-bg)",
              color: "var(--btn-cta-text)",
              fontSize: "0.95rem",
              fontWeight: 600,
              minHeight: "48px",
              padding: "12px 20px",
              borderRadius: "8px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "var(--btn-cta-shadow)",
            }}
          >
            <span>Start with Ballast Free</span>
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
        </div>
      )}
    </header>
  );
}
