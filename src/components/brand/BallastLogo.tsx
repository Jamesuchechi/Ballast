"use client";

import React from "react";
import Link from "next/link";

export interface BallastLogoProps {
  size?: number;
  markOnly?: boolean;
  showBadge?: boolean;
  badgeText?: string;
  showSubtitle?: boolean;
  subtitleText?: string;
  linkHref?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function BallastMark({ size = 28, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: `${Math.max(6, Math.round(size * 0.22))}px`,
        background: "linear-gradient(135deg, #090c12 0%, #050608 100%)",
        border: "1px solid rgba(16, 185, 129, 0.35)",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.6), 0 0 12px rgba(16, 185, 129, 0.15)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `${Math.round(size * 0.12)}px`,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      >
        <defs>
          <linearGradient id="blstGrad" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6ee7b7" />
            <stop offset="0.3" stopColor="#34d399" />
            <stop offset="0.7" stopColor="#10b981" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
          <filter id="blstGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="1" floodColor="#10b981" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Horizon Calibration Bar */}
        <line x1="8" y1="12" x2="24" y2="12" stroke="url(#blstGrad)" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="11" y1="10.5" x2="11" y2="13.5" stroke="#a7f3d0" strokeWidth="1" strokeLinecap="round" />
        <line x1="21" y1="10.5" x2="21" y2="13.5" stroke="#a7f3d0" strokeWidth="1" strokeLinecap="round" />

        {/* Top Gyro Ring */}
        <circle cx="16" cy="7.5" r="2.8" stroke="url(#blstGrad)" strokeWidth="1.8" />
        <circle cx="16" cy="7.5" r="1" fill="#6ee7b7" />

        {/* Central Keel Spine */}
        <line x1="16" y1="9.5" x2="16" y2="24.5" stroke="url(#blstGrad)" strokeWidth="2.4" strokeLinecap="round" />

        {/* Symmetrical Dual-Fluke Ballast Arc */}
        <path
          d="M8 17.5 C8 22.5, 11.5 25.8, 16 25.8 C20.5 25.8, 24 22.5, 24 17.5"
          stroke="url(#blstGrad)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Fluke Tips (Gate 1 & Gate 2) */}
        <path d="M6 17.5 L8 15.5 L10 17.5" stroke="url(#blstGrad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 17.5 L24 15.5 L26 17.5" stroke="url(#blstGrad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {/* Central Grounding Citation Node */}
        <polygon points="16,14.5 18.5,17 16,19.5 13.5,17" fill="#a7f3d0" filter="url(#blstGlow)" />
      </svg>
    </div>
  );
}

export function BallastLogo({
  size = 28,
  markOnly = false,
  showBadge = false,
  badgeText = "OS",
  showSubtitle = false,
  subtitleText = "Personal Briefing OS",
  linkHref,
  className,
  style,
}: BallastLogoProps) {
  const content = (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${Math.max(8, Math.round(size * 0.35))}px`,
        textDecoration: "none",
        color: "inherit",
        userSelect: "none",
        ...style,
      }}
    >
      <BallastMark size={size} />

      {!markOnly && (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 700,
                fontSize: `${Math.round(size * 0.72)}px`,
                letterSpacing: "-0.03em",
                color: "var(--text)",
                lineHeight: 1.1,
              }}
            >
              Ballast
            </span>

            {showBadge && (
              <span
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: "4px",
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  letterSpacing: "0.04em",
                  lineHeight: 1.2,
                }}
              >
                {badgeText}
              </span>
            )}
          </div>

          {showSubtitle && (
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.02em",
                marginTop: "1px",
              }}
            >
              {subtitleText}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (linkHref) {
    return (
      <Link href={linkHref} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </Link>
    );
  }

  return content;
}
