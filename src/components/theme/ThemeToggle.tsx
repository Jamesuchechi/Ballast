"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          border: "1px solid var(--card-border)",
        }}
      />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark ? "rgba(255, 255, 255, 0.1)" : "var(--card-bg-subtle)",
        backdropFilter: "blur(8px)",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid var(--card-border)",
        color: isDark ? "#ffffff" : "var(--text)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: isDark ? "0 2px 8px rgba(0, 0, 0, 0.3)" : "0 2px 8px rgba(0, 0, 0, 0.05)",
      }}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? (
        <Sun size={17} strokeWidth={2.2} style={{ color: "#facc15" }} />
      ) : (
        <Moon size={17} strokeWidth={2.2} style={{ color: "#4f46e5" }} />
      )}
    </button>
  );
}
