"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navbar } from "./Navbar";

const stats = [
  { value: "0%", label: "Invented Claims" },
  { value: "100%", label: "Citable Evidence" },
  { value: "2-Gate", label: "Critic Validation" },
];

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        backgroundColor: "#000000",
      }}
    >
      {/* Cinematic Background Image with Ken Burns animation */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/hero-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          animation: "heroZoom 24s ease-in-out infinite alternate",
          zIndex: 0,
        }}
      />

      {/* Triple Neutral Dark Overlays — Apple-clean & cinematic */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0, 0, 0, 0.78) 0%, rgba(0, 0, 0, 0.65) 50%, #000000 100%)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 20%, rgba(0, 0, 0, 0.95) 85%)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* Film grain texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          mixBlendMode: "overlay",
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\' opacity=\'0.6\'/></svg>")',
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      <Navbar />

      {/* Hero Headline & Subtitle */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: "980px",
          margin: "0 auto",
          textAlign: "center",
          padding: "44px 16px 60px",
          animation: "heroFadeIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            backdropFilter: "blur(12px)",
            padding: "6px 14px",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            color: "#ffffff",
            marginBottom: "24px",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.4)",
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: "#22c55e",
              boxShadow: "0 0 10px #22c55e",
              flexShrink: 0,
            }}
          />
          <span style={{ letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            BALLAST OS • CITATION-GATED BRIEFING
          </span>
        </div>

        <h1
          style={{
            fontSize: "clamp(2.35rem, 7.5vw, 6.8rem)",
            fontWeight: 600,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
            marginBottom: "20px",
            color: "#ffffff",
            textShadow: "0 4px 30px rgba(0, 0, 0, 0.7)",
          }}
        >
          Ask The Messy.
          <br />
          Ship The Brief.
        </h1>

        <p
          style={{
            fontSize: "clamp(1.02rem, 2.2vw, 1.35rem)",
            color: "rgba(255, 255, 255, 0.8)",
            maxWidth: "680px",
            margin: "0 auto 32px",
            lineHeight: 1.55,
            fontWeight: 300,
            textShadow: "0 2px 10px rgba(0, 0, 0, 0.8)",
          }}
        >
          The personal briefing OS for teams who need citable closure instead of
          chat threads. If it cannot cite, it does not state.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <Link
            href="/signup"
            style={{
              background: "#ffffff",
              color: "#000000",
              fontSize: "0.98rem",
              fontWeight: 600,
              padding: "14px 28px",
              borderRadius: "9999px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 24px rgba(255, 255, 255, 0.25)",
              transition: "transform 0.15s ease, background 0.15s ease",
            }}
          >
            Get started
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>

          <a
            href="#mockup"
            style={{
              background: "rgba(0, 0, 0, 0.4)",
              backdropFilter: "blur(12px)",
              color: "#ffffff",
              fontSize: "0.98rem",
              fontWeight: 500,
              padding: "14px 24px",
              borderRadius: "9999px",
              textDecoration: "none",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
            }}
          >
            See sample brief
          </a>
        </div>
      </div>

      {/* Bottom Stats Bar */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          borderTop: "1px solid var(--stats-border)",
          background: "var(--stats-bg)",
          backdropFilter: "blur(20px)",
          transition: "background-color 0.25s ease, border-color 0.25s ease",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "20px 16px",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
          }}
        >
          {stats.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "clamp(1.4rem, 3.2vw, 2.6rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  color: "var(--stats-value)",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: "clamp(0.64rem, 1.8vw, 0.75rem)",
                  color: "var(--stats-label)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginTop: "2px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
