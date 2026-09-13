"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Terminal,
  Shield,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Send,
  Activity,
  Check,
} from "lucide-react";
import { Navbar } from "./Navbar";

interface SlideInfo {
  id: string;
  imageSrc: string;
  moduleNum: string;
  tag: string;
  tagColor: string;
  title: string;
  summary: string;
  icon: React.ElementType;
}

const slides: SlideInfo[] = [
  {
    id: "ingest",
    imageSrc: "/hero/slide-1-ingest.svg",
    moduleNum: "01 // 07",
    tag: "XML DATA ISOLATION",
    tagColor: "#10b981",
    title: "Untrusted Data Isolation",
    summary: "External text from Gmail, GitHub, and docs is sealed in XML boundaries. Instructions can never be poisoned.",
    icon: Database,
  },
  {
    id: "critic",
    imageSrc: "/hero/slide-2-critic.svg",
    moduleNum: "02 // 07",
    tag: "CRITIC DUAL-GATE",
    tagColor: "#06b6d4",
    title: "Adversarial Critic Evaluation",
    summary: "A two-pass audit validates every claim against quote spans. Unsourced statements and prompt injections are stripped.",
    icon: ShieldCheck,
  },
  {
    id: "citations",
    imageSrc: "/hero/slide-3-citations.svg",
    moduleNum: "03 // 07",
    tag: "STRICT GROUNDING",
    tagColor: "#10b981",
    title: "Grounded Ingestion Spans",
    summary: "Every published claim links directly to a verbatim source quote with author, commit hash, and timestamp.",
    icon: CheckCircle2,
  },
  {
    id: "conflicts",
    imageSrc: "/hero/slide-4-conflicts.svg",
    moduleNum: "04 // 07",
    tag: "DISCREPANCY MATRIX",
    tagColor: "#f59e0b",
    title: "First-Class Conflict Surfacing",
    summary: "When team records disagree, Ballast surfaces the discrepancy explicitly naming both sources. No silent coin flips.",
    icon: AlertTriangle,
  },
  {
    id: "brief",
    imageSrc: "/hero/slide-5-brief.svg",
    moduleNum: "05 // 07",
    tag: "CANONICAL BRIEF",
    tagColor: "#10b981",
    title: "Frozen 8-Section Brief",
    summary: "Standardized executive briefing output with mandatory 'What I did not do' safety audit, Markdown, and PDF export.",
    icon: FileText,
  },
  {
    id: "actions",
    imageSrc: "/hero/slide-6-actions.svg",
    moduleNum: "06 // 07",
    tag: "ACTION DISPATCHER",
    tagColor: "#f59e0b",
    title: "Human-Gated Action Drafts",
    summary: "Proposes email and GitHub issue drafts with human sign-off. Zero ungrounded external writes ever execute automatically.",
    icon: Send,
  },
  {
    id: "telemetry",
    imageSrc: "/hero/slide-7-telemetry.svg",
    moduleNum: "07 // 07",
    tag: "HONEST OBSERVABILITY",
    tagColor: "#10b981",
    title: "Runtime Telemetry & Economics",
    summary: "Transparent audit of latency (380ms), token input/output breakdown, exact invocation dollar cost, and circuit breaker health.",
    icon: Activity,
  },
];

const stats = [
  { value: "0%", label: "Invented Claims", sublabel: "Critic-suppressed" },
  { value: "100%", label: "Citable Evidence", sublabel: "Strict XML boundary" },
  { value: "2-Gate", label: "Critic Validation", sublabel: "Writer + Critic audit" },
  { value: "100%", label: "Deterministic", sublabel: "Verbatim quote spans" },
];

export function Hero() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Switch image every 2 seconds (2000ms)
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 2000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused]);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const activeSlide = slides[currentSlide];
  const ActiveIcon = activeSlide.icon;

  return (
    <section
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        backgroundColor: "#050608",
      }}
    >
      <style>{`
        .hero-50-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(24px, 4vw, 56px);
          align-items: center;
          width: 100%;
          max-width: 1340px;
          margin: 0 auto;
          padding: 40px 24px 32px;
        }
        @media (max-width: 1024px) {
          .hero-50-grid {
            grid-template-columns: 1fr;
            padding: 24px 16px 28px;
            gap: 36px;
          }
          .hero-text-col {
            text-align: center !important;
            align-items: center !important;
          }
          .hero-cta-group {
            justify-content: center !important;
          }
          .hero-invariants-list {
            justify-content: center !important;
          }
        }
        .slide-fade-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      {/* Ambient background glow effects */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          right: "5%",
          width: "550px",
          height: "550px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          left: "-5%",
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6, 182, 212, 0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Top Navbar */}
      <div style={{ position: "relative", zIndex: 20 }}>
        <Navbar />
      </div>

      {/* 50 / 50 Split Layout Section */}
      <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", alignItems: "center" }}>
        <div className="hero-50-grid">
          {/* =========================================================================
              LEFT 50%: TEXT CONTENT & VALUE PROPOSITION
              ========================================================================= */}
          <div
            className="hero-text-col"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              textAlign: "left",
            }}
          >
            {/* Status Pill Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(13, 15, 21, 0.9)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                padding: "6px 14px",
                borderRadius: "9999px",
                fontSize: "0.74rem",
                fontFamily: "var(--font-mono)",
                color: "#10b981",
                fontWeight: 600,
                letterSpacing: "0.06em",
                marginBottom: "20px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                  boxShadow: "0 0 8px #10b981",
                  flexShrink: 0,
                }}
              />
              <span>BALLAST OS // PURE DUAL-GATE CITATION ENGINE</span>
            </div>

            {/* Main Headline */}
            <h1
              style={{
                fontSize: "clamp(2.4rem, 4.4vw, 4.2rem)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                marginBottom: "20px",
                color: "#ffffff",
              }}
            >
              Ask The Messy.
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #ffffff 30%, #34d399 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Ship The Brief.
              </span>
            </h1>

            {/* Subtitle / Positioning */}
            <p
              style={{
                fontSize: "clamp(1.02rem, 1.4vw, 1.18rem)",
                color: "rgba(255, 255, 255, 0.8)",
                maxWidth: "540px",
                lineHeight: 1.6,
                marginBottom: "28px",
                fontWeight: 400,
              }}
            >
              The personal briefing OS for teams who need citable closure instead of
              unending chat threads. If it cannot cite, it does not state.
            </p>

            {/* CTA Button Group */}
            <div
              className="hero-cta-group"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "32px",
                width: "100%",
              }}
            >
              <Link
                href="/signup"
                style={{
                  background: "var(--btn-cta-bg)",
                  color: "var(--btn-cta-text)",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  padding: "13px 26px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "var(--btn-cta-shadow)",
                  minHeight: "48px",
                  transition: "transform 0.15s ease",
                }}
              >
                <span>Start with Ballast Free</span>
                <ArrowRight size={16} strokeWidth={2.5} />
              </Link>

              <Link
                href="/app"
                style={{
                  background: "rgba(13, 15, 21, 0.85)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  color: "#ffffff",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  padding: "13px 22px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  fontFamily: "var(--font-mono)",
                  minHeight: "48px",
                  transition: "all 0.15s ease",
                }}
              >
                <Terminal size={15} color="#10b981" />
                <span>Open Dashboard Console</span>
              </Link>
            </div>

            {/* Active Capability Synchronization Callout */}
            <div
              style={{
                width: "100%",
                maxWidth: "520px",
                background: "rgba(13, 15, 21, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "10px",
                padding: "12px 16px",
                backdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: activeSlide.tagColor,
                  marginTop: "2px",
                }}
              >
                <ActiveIcon size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "3px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: activeSlide.tagColor,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {activeSlide.tag}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.68rem",
                      color: "#64748b",
                    }}
                  >
                    [{activeSlide.moduleNum}]
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "#f1f5f9",
                    marginBottom: "2px",
                  }}
                >
                  {activeSlide.title}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#94a3b8",
                    lineHeight: 1.4,
                  }}
                >
                  {activeSlide.summary}
                </div>
              </div>
            </div>

            {/* Core Invariant Guarantees */}
            <div
              className="hero-invariants-list"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "18px",
                flexWrap: "wrap",
                fontSize: "0.8rem",
                color: "#94a3b8",
                fontFamily: "var(--font-mono)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Check size={14} color="#10b981" strokeWidth={3} />
                <span>Zero Hallucinations</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Check size={14} color="#10b981" strokeWidth={3} />
                <span>XML Corpus Sealing</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Check size={14} color="#10b981" strokeWidth={3} />
                <span>Human-Approved Writes</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
              RIGHT 50%: SLIDING IMAGES CAROUSEL (7 IMAGES ROTATING EVERY 2 SECONDS)
              ========================================================================= */}
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Console Frame Container */}
            <div
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              style={{
                width: "100%",
                maxWidth: "640px",
                background: "#0a0c12",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: "14px",
                overflow: "hidden",
                boxShadow: "0 24px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(16, 185, 129, 0.15)",
                display: "flex",
                flexDirection: "column",
                transition: "border-color 0.3s ease",
              }}
            >
              {/* Window Chrome Header Bar */}
              <div
                style={{
                  height: "42px",
                  background: "rgba(16, 20, 30, 0.95)",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                  gap: "10px",
                }}
              >
                {/* Left Window Dots */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ef4444" }} />
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#f59e0b" }} />
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#10b981" }} />
                </div>

                {/* Center Active Slide Badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.72rem",
                    fontFamily: "var(--font-mono)",
                    color: activeSlide.tagColor,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  <ActiveIcon size={12} />
                  <span>{activeSlide.tag}</span>
                  <span style={{ color: "rgba(255, 255, 255, 0.4)", marginLeft: "4px" }}>
                    {activeSlide.moduleNum}
                  </span>
                </div>

                {/* Right Navigation & Play/Pause Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <button
                    onClick={handlePrev}
                    aria-label="Previous slide"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "4px",
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <ChevronLeft size={13} />
                  </button>

                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    aria-label={isPaused ? "Play" : "Pause"}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "4px",
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: isPaused ? "#f59e0b" : "#10b981",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {isPaused ? <Play size={10} /> : <Pause size={10} />}
                  </button>

                  <button
                    onClick={handleNext}
                    aria-label="Next slide"
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "4px",
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* Viewport: 16/10 Aspect Ratio Displaying Sliding Images */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16 / 10",
                  backgroundColor: "#06080d",
                  overflow: "hidden",
                }}
              >
                {slides.map((slide, idx) => {
                  const isVisible = currentSlide === idx;
                  return (
                    <div
                      key={slide.id}
                      className="slide-fade-image"
                      style={{
                        opacity: isVisible ? 1 : 0,
                        pointerEvents: isVisible ? "auto" : "none",
                        zIndex: isVisible ? 2 : 1,
                      }}
                    >
                      <img
                        src={slide.imageSrc}
                        alt={slide.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          objectPosition: "center center",
                          display: "block",
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Console Frame Footer: Progress Bar & Switching Rhythm */}
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(10, 12, 18, 0.95)",
                  borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                {/* 7 Progress Segments (Auto-switching every 2s) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: "5px",
                    marginBottom: "8px",
                  }}
                >
                  {slides.map((s, idx) => {
                    const isActive = currentSlide === idx;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setCurrentSlide(idx)}
                        aria-label={`Jump to slide ${idx + 1}: ${s.title}`}
                        title={s.title}
                        style={{
                          height: "4px",
                          borderRadius: "2px",
                          background: isActive ? "#10b981" : "rgba(255, 255, 255, 0.16)",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          transition: "all 0.25s ease",
                        }}
                      />
                    );
                  })}
                </div>

                {/* Sub-label showing pause/play state & caption */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.7rem",
                    fontFamily: "var(--font-mono)",
                    color: "#94a3b8",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: isPaused ? "#f59e0b" : "#10b981",
                      }}
                    />
                    <span>
                      {isPaused ? "❚❚ PAUSED (Hovering)" : "▶ 2s SLIDE ROTATION"}
                    </span>
                  </div>

                  <span style={{ color: "#64748b" }}>
                    Slide {currentSlide + 1} of 7
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Proof Metrics Bar */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(5, 6, 8, 0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "18px 20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
            gap: "16px",
          }}
        >
          {stats.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "clamp(1.5rem, 2.8vw, 2rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#10b981",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "#ffffff",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginTop: "2px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "rgba(255, 255, 255, 0.55)",
                  marginTop: "2px",
                }}
              >
                {s.sublabel}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
