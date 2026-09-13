"use client";

import React from "react";

const steps = [
  {
    num: "01 // RETRIEVE",
    title: "Connect & Ingest",
    desc: "Sync read-only windows from Gmail (90d default), GitHub PRs, and uploaded files. Ingested payloads are isolated into untrusted data blocks within XML boundaries, never blended into prompt instructions.",
  },
  {
    num: "02 // THE CRITIC GATE",
    title: "Dual-Gate Audit",
    desc: "A separate, swappable Critic function validates every proposed sentence against retrieved quote spans. Unsourced assertions are dropped entirely—never footnoted or guessed. Contradictions become first-class conflict citations.",
  },
  {
    num: "03 // SHIP & PROPOSE",
    title: "Citable Brief & Actions",
    desc: "Receive a dated brief formatted in the frozen 8-section template with markdown and PDF export. Action drafts are proposed, but nothing sends or writes without explicit operator sign-off.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      style={{
        padding: "70px 16px",
        maxWidth: "1200px",
        margin: "0 auto",
        transition: "background-color 0.25s ease",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <div
          style={{
            fontSize: "0.78rem",
            fontFamily: "var(--font-mono)",
            color: "var(--accent-text)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "12px",
            fontWeight: 700,
          }}
        >
          The Architecture
        </div>
        <h2
          style={{
            fontSize: "clamp(1.85rem, 4vw, 3.2rem)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text)",
          }}
        >
          How Ballast Works
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
          gap: "20px",
        }}
      >
        {steps.map((step) => (
          <div
            key={step.num}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "14px",
              padding: "28px 24px",
              position: "relative",
              boxShadow: "var(--card-shadow)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              transition: "border-color 0.2s ease, transform 0.2s ease",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.82rem",
                color: "var(--accent-text)",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              {step.num}
            </div>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              {step.title}
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.92rem",
                lineHeight: 1.65,
              }}
            >
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
