import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

const ThemeContext = createContext();

// Helper để lấy theme từ localStorage an toàn (phía client)
function getSavedTheme() {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem("lpr_theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) {
    // ignore
  }
  return null;
}

// Helper để lấy system preference
function getSystemTheme() {
  if (typeof window === "undefined") return "dark"; // fallback cho SSR
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeProvider({ children }) {
  // 1. State an toàn SSR
  const [theme, setTheme] = useState(() => {
    return getSavedTheme() || getSystemTheme();
  });

  // 2. Đánh dấu đã mount để tránh effect chạy không cần thiết
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 3. Lắng nghe system preference thay đổi (chỉ khi user chưa set cứng)
  useEffect(() => {
    if (!mounted) return;
    const saved = getSavedTheme();
    if (saved) return; // Nếu user đã chọn, không theo system nữa

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e) => {
      setTheme(e.matches ? "light" : "dark");
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [mounted]);

  // 4. Đồng bộ qua các tab
  useEffect(() => {
    if (!mounted) return;
    const handleStorage = (e) => {
      if (e.key === "lpr_theme" && e.newValue) {
        if (e.newValue === "light" || e.newValue === "dark") {
          setTheme(e.newValue);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [mounted]);

  // 5. Cập nhật DOM và localStorage khi theme thay đổi
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("lpr_theme", theme);
    document.documentElement.setAttribute(
      "data-theme",
      theme === "dark" ? "dark" : "light"
    );
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme, mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}