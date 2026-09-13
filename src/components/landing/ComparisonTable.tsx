"use client";

import React from "react";

const rows = [
  {
    feature: "Output Format",
    them: "Ephemeral, rambling chat transcript",
    ballast: "Versioned brief with a frozen 8-section skeleton",
  },
  {
    feature: "Memory & Ingest",
    them: "Implicit, unbounded hallucinations",
    ballast: "Connected sources, strictly labeled private vs. web",
  },
  {
    feature: "Hallucinations",
    them: "Sounds sure even when inventing facts",
    ballast: "Critic gate suppresses any claim lacking exact quote citations",
  },
  {
    feature: "Contradictions",
    them: "Silently picks a winner or flips a coin",
    ballast: "First-class conflict citations naming both sides",
  },
  {
    feature: "External Writes",
    them: "Often eager or ungrounded executions",
    ballast: "Drafts only; zero execution without explicit operator approval",
  },
  {
    feature: "Follow-ups",
    them: "Buries the answer in long chat logs",
    ballast: "New brief row with parent_brief_id diff",
  },
];

export function ComparisonTable() {
  return (
    <section
      id="comparison"
      style={{
        padding: "60px 16px 100px",
        maxWidth: "1080px",
        margin: "0 auto",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "36px" }}>
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
          The Difference
        </div>
        <h2
          style={{
            fontSize: "clamp(1.85rem, 4vw, 3.2rem)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text)",
          }}
        >
          Chat AI vs. Ballast
        </h2>
      </div>

      {/* Desktop 3-Column Table */}
      <div
        className="desktop-only"
        style={{
          border: "1px solid var(--card-border)",
          borderRadius: "14px",
          overflow: "hidden",
          background: "var(--card-bg)",
          boxShadow: "var(--card-shadow)",
          transition: "background-color 0.25s ease, border-color 0.25s ease",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "18px 24px",
                  textAlign: "left",
                  background: "var(--table-header-bg)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--table-border)",
                }}
              >
                Capability
              </th>
              <th
                style={{
                  padding: "18px 24px",
                  textAlign: "left",
                  background: "var(--table-header-bg)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--table-border)",
                }}
              >
                Generic Chatbots
              </th>
              <th
                style={{
                  padding: "18px 24px",
                  textAlign: "left",
                  background: "var(--table-ballast-col)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--accent-text)",
                  borderBottom: "1px solid var(--table-border)",
                  fontWeight: 700,
                }}
              >
                Ballast Briefing OS
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.feature}>
                <td
                  style={{
                    padding: "18px 24px",
                    fontWeight: 600,
                    color: "var(--text)",
                    borderBottom:
                      idx === rows.length - 1
                        ? "none"
                        : "1px solid var(--table-border)",
                    fontSize: "0.92rem",
                  }}
                >
                  {row.feature}
                </td>
                <td
                  style={{
                    padding: "18px 24px",
                    color: "var(--text-subtle)",
                    borderBottom:
                      idx === rows.length - 1
                        ? "none"
                        : "1px solid var(--table-border)",
                    fontSize: "0.92rem",
                  }}
                >
                  {row.them}
                </td>
                <td
                  style={{
                    padding: "18px 24px",
                    color: "var(--table-ballast-text)",
                    fontWeight: 600,
                    background: "var(--table-ballast-col)",
                    borderBottom:
                      idx === rows.length - 1
                        ? "none"
                        : "1px solid var(--table-border)",
                    fontSize: "0.92rem",
                  }}
                >
                  {row.ballast}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile-Native Stacked Comparison Cards (Zero Horizontal Scroll) */}
      <div
        className="mobile-only"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          width: "100%",
        }}
      >
        {rows.map((row) => (
          <div
            key={row.feature}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "14px",
              padding: "18px 16px",
              boxShadow: "var(--card-shadow)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text)",
              }}
            >
              {row.feature}
            </div>

            <div
              style={{
                background: "var(--card-bg-subtle)",
                borderRadius: "8px",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "4px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                }}
              >
                ✕ Generic Chatbots
              </div>
              <div style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                {row.them}
              </div>
            </div>

            <div
              style={{
                background: "var(--table-ballast-col)",
                border: "1px solid rgba(16, 185, 129, 0.28)",
                borderRadius: "8px",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--accent-text)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "4px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                }}
              >
                ✓ Ballast Briefing OS
              </div>
              <div style={{ fontSize: "0.9rem", color: "var(--table-ballast-text)", fontWeight: 600, lineHeight: 1.5 }}>
                {row.ballast}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
