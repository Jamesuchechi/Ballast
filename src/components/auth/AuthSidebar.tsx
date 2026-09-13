"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, FileText, Sparkles } from "lucide-react";
import { BallastLogo } from "@/components/brand/BallastLogo";

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
        backgroundImage:
          "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        minHeight: "100%",
      }}
    >
      {/* Subtle emerald ambient glow */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "360px",
          height: "360px",
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
          zIndex: 0,
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
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
          }}
        >
          <BallastLogo size={32} showBadge badgeText="OS" />
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
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              color: "#ffffff",
              marginBottom: "16px",
            }}
          >
            {headline}
          </h1>
          <p
            style={{
              fontSize: "1.05rem",
              color: "#94a3b8",
              fontWeight: 400,
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
                  color: "#cbd5e1",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} color="#10b981" />
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
          color: "#64748b",
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
              backgroundColor: "#10b981",
              boxShadow: "0 0 8px #10b981",
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#10b981" }}>
            Critic gate operational
          </span>
        </div>
      </div>
    </div>
  );
}
