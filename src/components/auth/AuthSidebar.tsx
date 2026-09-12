"use client";

import React from "react";
import Link from "next/link";
import { Anchor, ShieldCheck, FileText, Sparkles } from "lucide-react";

interface AuthSidebarProps {
  headline?: React.ReactNode;
  description?: string;
  features?: Array<{
    icon: React.ElementType;
    label: string;
  }>;
}

const defaultFeatures = [
  { icon: ShieldCheck, label: "Critic validation on every claim" },
  { icon: FileText, label: "Frozen 8-heading brief format" },
  { icon: Sparkles, label: "Private source boundary isolation" },
];

export function AuthSidebar({
  headline = (
    <>
      Ask the messy.
      <br />
      Ship the brief.
    </>
  ),
  description = "The personal briefing OS for teams who need citable closure instead of chat threads. If it cannot cite, it does not state.",
  features = defaultFeatures,
}: AuthSidebarProps) {
  return (
    <div
      className="auth-sidebar"
      style={{
        position: "relative",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 56px",
        color: "#ffffff",
        overflow: "hidden",
        backgroundColor: "#050608",
        minHeight: "100%",
      }}
    >
      {/* Cinematic background image */}
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

      {/* Vignette and dark overlays */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.7) 50%, #000000 100%)",
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 30% 40%, transparent 20%, #000000 95%)",
          zIndex: 1,
        }}
      />

      {/* Film grain texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.06,
          mixBlendMode: "overlay",
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\' opacity=\'0.5\'/></svg>")',
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Top: Brand Logo */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "1.2rem",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          <Anchor size={22} color="#ffffff" strokeWidth={2.4} />
          <span>Ballast</span>
        </Link>
      </div>

      {/* Middle: Headline + Feature Pills */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: "440px",
          margin: "48px 0",
        }}
      >
        <div style={{ marginBottom: "32px" }}>
          <h1
            style={{
              fontSize: "clamp(2.4rem, 3.8vw, 3.4rem)",
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              color: "#ffffff",
              marginBottom: "16px",
              textShadow: "0 4px 20px rgba(0, 0, 0, 0.6)",
            }}
          >
            {headline}
          </h1>
          <p
            style={{
              fontSize: "1.05rem",
              color: "rgba(255, 255, 255, 0.7)",
              fontWeight: 300,
              lineHeight: 1.6,
            }}
          >
            {description}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  fontSize: "0.92rem",
                  color: "rgba(255, 255, 255, 0.85)",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backdropFilter: "blur(8px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} color="#a5b4fc" />
                </div>
                <span>{f.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom: Meta Info & Status Indicator */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.8rem",
          color: "rgba(255, 255, 255, 0.5)",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <span>© 2026 Ballast OS</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: "#22c55e",
              boxShadow: "0 0 8px #22c55e",
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
            Critic gate operational
          </span>
        </div>
      </div>
    </div>
  );
}
