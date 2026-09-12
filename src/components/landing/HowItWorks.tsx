"use client";

import React from "react";

const steps = [
  {
    num: "01",
    title: "Connect & Retrieve",
    desc: "Sync read-only windows from Gmail (90d default), GitHub PRs, and manual documents. Ingested text is isolated into XML data boundaries, never blended with instructions.",
  },
  {
    num: "02",
    title: "The Critic Gate",
    desc: "A separate, swappable Critic function checks every proposed claim against retrieved quotes. Unsourced assertions are dropped, not footnoted. Discrepancies become first-class conflicts.",
  },
  {
    num: "03",
    title: "Ship & Propose",
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
            fontSize: "0.8rem",
            fontFamily: "var(--font-mono)",
            color: "var(--accent-text)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: "12px",
            fontWeight: 600,
          }}
        >
          The Architecture
        </div>
        <h2
          style={{
            fontSize: "clamp(1.85rem, 4vw, 3.2rem)",
            fontWeight: 600,
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
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
          gap: "20px",
        }}
      >
        {steps.map((step) => (
          <div
            key={step.num}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "16px",
              padding: "28px 24px",
              position: "relative",
              boxShadow: "var(--card-shadow)",
              transition: "all 0.2s ease",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                color: "var(--accent-text)",
                marginBottom: "14px",
                fontWeight: 600,
              }}
            >
              {step.num}
            </div>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "12px",
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
                lineHeight: 1.6,
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
