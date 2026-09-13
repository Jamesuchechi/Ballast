"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BallastMark } from "@/components/brand/BallastLogo";

export function Footer() {
  return (
    <>
      {/* Bottom CTA Banner */}
      <section
        style={{
          padding: "70px 16px",
          textAlign: "center",
          borderTop: "1px solid var(--card-border)",
          background:
            "radial-gradient(circle at 50% 100%, var(--mockup-glow) 0%, transparent 65%)",
          transition: "border-color 0.25s ease",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.9rem, 5vw, 4.4rem)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: "16px",
            color: "var(--text)",
          }}
        >
          Ask The Messy.
          <br />
          Ship The Brief.
        </h2>

        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "clamp(1rem, 2vw, 1.15rem)",
            maxWidth: "540px",
            margin: "0 auto 32px",
            lineHeight: 1.6,
          }}
        >
          Trade open tabs and messy chat threads for dated, citable closure.
        </p>

        <Link
          href="/signup"
          style={{
            background: "var(--btn-cta-bg)",
            color: "var(--btn-cta-text)",
            fontSize: "1rem",
            fontWeight: 700,
            padding: "14px 32px",
            borderRadius: "8px",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            minHeight: "48px",
            boxShadow: "var(--btn-cta-shadow)",
            transition: "all 0.2s ease",
          }}
        >
          <span>Start with Ballast Free</span>
          <ArrowRight size={16} strokeWidth={2.5} />
        </Link>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--card-border)",
          padding: "32px 16px",
          fontSize: "0.82rem",
          color: "var(--text-subtle)",
          background: "var(--footer-bg)",
          transition: "background-color 0.25s ease, border-color 0.25s ease",
          fontFamily: "var(--font-mono)",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <BallastMark size={20} />
            <span>Ballast OS © 2026. If it cannot cite, it does not state.</span>
          </div>

          <div>Built with Next.js 16+, React 19, and PostgreSQL.</div>
        </div>
      </footer>
    </>
  );
}
