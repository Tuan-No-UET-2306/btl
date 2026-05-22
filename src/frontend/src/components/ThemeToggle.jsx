import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [focused, setFocused] = useState(false); // để bắt chước :focus-visible

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        style={baseButtonStyle}
        title="Toggle theme"
        aria-label="Toggle theme"
        disabled
      >
        <span style={trackStyle}>
          <span style={thumbStyle} />
        </span>
      </button>
    );
  }

  const isDark = theme === "dark";

  const trackDynamic = {
    ...trackStyle,
    backgroundColor: isDark ? "#4b5563" : "#d1d5db",
  };

  const thumbDynamic = {
    ...thumbStyle,
    transform: isDark ? "translateX(20px)" : "translateX(0)",
    backgroundColor: isDark ? "#fbbf24" : "#facc15",
  };

  const focusOutline = focused
    ? { outline: "2px solid #3b82f6", outlineOffset: "2px", borderRadius: "4px" }
    : {};

  return (
    <button
      type="button"
      onClick={toggleTheme}
      style={{ ...baseButtonStyle, ...focusOutline }}
      title="Toggle theme"
      aria-label="Toggle theme"
      aria-pressed={isDark}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span style={trackDynamic}>
        <span style={thumbDynamic}>
          {isDark ? <Moon size={12} /> : <Sun size={12} />}
        </span>
      </span>
    </button>
  );
}

const baseButtonStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const trackStyle = {
  display: "block",
  width: "44px",
  height: "24px",
  borderRadius: "12px",
  position: "relative",
  transition: "background-color 0.3s ease",
};

const thumbStyle = {
  position: "absolute",
  top: "2px",
  left: "2px",
  width: "20px",
  height: "20px",
  borderRadius: "50%",
  backgroundColor: "white",
  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "transform 0.3s ease, background-color 0.3s ease",
};