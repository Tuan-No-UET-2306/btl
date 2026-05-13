import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle theme"
    >
      <span className="theme-toggle-track">
        <span className={`theme-toggle-thumb ${theme === "dark" ? "dark" : "light"}`}>
          {theme === "dark" ? <Moon size={12} /> : <Sun size={12} />}
        </span>
      </span>
    </button>
  );
}