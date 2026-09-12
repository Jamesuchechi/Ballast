"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Anchor, Menu, X, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav
      style={{
        position: "relative",
        zIndex: 50,
        maxWidth: "1200px",
        margin: "0 auto",
        width: "100%",
        height: "76px",
        padding: "0 20px",
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
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "#ffffff",
          textDecoration: "none",
        }}
      >
        <Anchor size={22} color="#ffffff" strokeWidth={2.4} />
        <span>Ballast</span>
      </Link>

      {/* Desktop Navigation */}
      <div
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
            fontSize: "0.9rem",
            color: "rgba(255, 255, 255, 0.75)",
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
            fontSize: "0.9rem",
            color: "rgba(255, 255, 255, 0.75)",
            textDecoration: "none",
            fontWeight: 500,
            transition: "color 0.15s ease",
          }}
        >
          Why Ballast
        </a>
        <Link
          href="/login"
          style={{
            fontSize: "0.9rem",
            color: "rgba(255, 255, 255, 0.75)",
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
            background: "#ffffff",
            color: "#000000",
            fontSize: "0.88rem",
            fontWeight: 600,
            padding: "8px 20px",
            borderRadius: "9999px",
            textDecoration: "none",
            transition: "all 0.15s ease",
          }}
        >
          Get started
        </Link>
        <ThemeToggle />
      </div>

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
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255, 255, 255, 0.12)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#ffffff",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Slide-down Navigation Panel */}
      {mobileMenuOpen && (
        <div
          style={{
            position: "absolute",
            top: "76px",
            left: 0,
            right: 0,
            background: "rgba(8, 10, 15, 0.96)",
            backdropFilter: "blur(24px)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
            padding: "24px 20px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            zIndex: 100,
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.8)",
            animation: "heroFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: "1.05rem",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 500,
              padding: "10px 0",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            How it works
          </a>
          <a
            href="#comparison"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: "1.05rem",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 500,
              padding: "10px 0",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            Why Ballast
          </a>
          <Link
            href="/login"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: "1.05rem",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 500,
              padding: "10px 0",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              marginTop: "8px",
              background: "#ffffff",
              color: "#000000",
              fontSize: "1rem",
              fontWeight: 600,
              padding: "14px 24px",
              borderRadius: "9999px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 20px rgba(255, 255, 255, 0.25)",
            }}
          >
            Get started
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
        </div>
      )}
    </nav>
  );
}
