import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { authApi } from "../api/client";
import { setAuth } from "../utils/auth";
import {
  LogIn,
  Shield,
  Eye,
  EyeOff,
  CheckCircle,
  User,
  Lock,
  Camera,
  Activity,
} from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("muted");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [plateFlash, setPlateFlash] = useState(false);
  const cardRef = useRef(null);

  // Typing animation states
  const [typingText, setTypingText] = useState("");
  const fullText = "Sign in to continue";
  const [typingIndex, setTypingIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (location.state?.registered) {
      setMessage("Account created successfully! Please sign in.");
      setMessageType("success");
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Typing effect
  useEffect(() => {
    if (typingIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setTypingText((prev) => prev + fullText[typingIndex]);
        setTypingIndex(typingIndex + 1);
      }, 80);
      return () => clearTimeout(timeout);
    }
  }, [typingIndex]);

  // Blinking cursor
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlateFlash(true);
      setTimeout(() => setPlateFlash(false), 900);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (cardRef.current) {
      if (focusedField) {
        cardRef.current.classList.add("glow");
      } else {
        cardRef.current.classList.remove("glow");
      }
    }
  }, [focusedField]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (message) {
      setMessage("");
      setMessageType("muted");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!form.username || !form.password) {
      setMessage("Please enter both username and password.");
      setMessageType("error");
      return;
    }

    setLoading(true);
    try {
      const payload = await authApi.login(form);
      setAuth(payload.access_token, payload.role, payload.username);
      navigate("/dashboard");
    } catch (error) {
      if (error.status === 401) {
        setMessage("Invalid username or password. Please try again.");
      } else {
        setMessage(error.message || "Login failed. Please try again.");
      }
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const handleRipple = (e) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };

  return (
    <main className="page auth-page" style={{ position: "relative", minHeight: "100vh" }}>
      <div className="floating-orbs">
        <div className="floating-orb" />
        <div className="floating-orb" />
        <div className="floating-orb" />
      </div>
      <div className="particles">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="particle" />
        ))}
      </div>

      <section
        ref={cardRef}
        className="card"
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: "1280px",
          width: "90%",
          margin: "2rem auto",
          overflow: "hidden",
          transition: "box-shadow 0.2s ease",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2rem",
            padding: "2rem",
          }}
        >
          {/* LEFT COLUMN */}
          <div
            className="card-visual"
            style={{
              background: "var(--visual-bg, rgba(0,0,0,0.2))",
              borderRadius: "1.5rem",
              padding: "1.5rem",
              backdropFilter: "blur(4px)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Camera size={20} style={{ color: "var(--accent-2)" }} />
                <span style={{ fontWeight: 600 }}>LaneCam #1</span>
                <span className="badge" style={{ background: "var(--badge-live-bg, #2ed57320)", color: "var(--badge-live-text, #2ed573)" }}>
                  <Activity size={10} /> LIVE
                </span>
              </div>
              <ThemeToggle />
            </div>

            <div className="scanner" style={{ margin: "1rem 0" }}>
              <div className="led-grid"></div>
              <div className="scanner-row">
                <span>Live lane feed</span>
                <span>Plate recognition</span>
              </div>
              <div className="scanner-track">
                <div className="lane"></div>
                <div className="scanner-car">
                  <div className="car-body">
                    <span className={`plate ${plateFlash ? "flash" : ""}`}>29A-123.45</span>
                    <span className="car-wheel left"></span>
                    <span className="car-wheel right"></span>
                  </div>
                </div>
                <div className="scanner-car">
                  <div className="car-body" style={{ background: "linear-gradient(120deg, #f6b250, #f0833e)" }}>
                    <span className={`plate ${plateFlash ? "flash" : ""}`}>51B-678.90</span>
                    <span className="car-wheel left"></span>
                    <span className="car-wheel right"></span>
                  </div>
                </div>
                <div className="scanner-car">
                  <div className="car-body" style={{ background: "linear-gradient(120deg, #6f89ff, #9b6fff)" }}>
                    <span className={`plate ${plateFlash ? "flash" : ""}`}>30C-543.21</span>
                    <span className="car-wheel left"></span>
                    <span className="car-wheel right"></span>
                  </div>
                </div>
              </div>
              <div className="scan-line"></div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem", gap: "1rem" }}>
              <div className="stat-card">
                <div className="stat-label">Today's detections</div>
                <div className="stat-value">142</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Active alerts</div>
                <div className="stat-value" style={{ color: "var(--error)" }}>3</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">System health</div>
                <div className="stat-value" style={{ color: "var(--success)" }}>98%</div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ padding: "0.5rem" }}>
            <div className="card-head" style={{ marginBottom: "1rem" }}>
              <span className="eyebrow">Welcome back</span>
              <span className="badge">
                <Shield size={10} /> LPR
              </span>
            </div>

            <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LogIn size={24} style={{ color: "var(--accent-2)" }} /> Login
            </h1>
            <div className="typed-wrapper" style={{ marginBottom: "1.5rem", minHeight: "24px" }}>
              <span className="typed-text">{typingText}</span>
              <span className={`typed-cursor ${showCursor ? "visible" : "hidden"}`}>|</span>
            </div>

            <form className="form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="login-username">Username</label>
                <div className={`input-wrapper ${focusedField === "username" ? "focused" : ""}`}>
                  <span className="input-icon">
                    <User size={16} className={focusedField === "username" ? "icon-focus" : ""} />
                  </span>
                  <input
                    id="login-username"
                    name="username"
                    placeholder="Your username"
                    value={form.username}
                    onChange={handleChange}
                    onFocus={() => setFocusedField("username")}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="login-password">Password</label>
                <div className={`input-wrapper ${focusedField === "password" ? "focused" : ""}`}>
                  <span className="input-icon">
                    <Lock size={16} className={focusedField === "password" ? "icon-focus" : ""} />
                  </span>
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Your password"
                    value={form.password}
                    onChange={handleChange}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {messageType === "success" && (
                <div style={{ fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
                  <CheckCircle size={14} /> {message}
                </div>
              )}
              {messageType === "error" && (
                <div style={{ fontSize: 12, color: "var(--error)", minHeight: 16 }}>{message}</div>
              )}
              {messageType === "muted" && <div className="message muted"> </div>}

              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading}
                onClick={handleRipple}
                style={{
                  padding: "12px 16px",
                  position: "relative",
                  overflow: "hidden",
                  width: "100%",
                  marginTop: "0.5rem",
                }}
              >
                {loading ? (
                  <>
                    <span className="radar-spinner" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn size={16} /> Sign in
                    <span className="btn-shimmer"></span>
                  </>
                )}
              </button>
            </form>

            <div className="form-footer" style={{ marginTop: "1.5rem" }}>
              <span>New here?</span>
              <Link to="/register" className="animated-link">Create an account</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}