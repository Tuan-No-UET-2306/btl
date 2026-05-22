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
  Server,
  Cpu,
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

  // Dynamic viewfinder details
  const [metrics, setMetrics] = useState({
    fps: 60.0,
    latency: 12,
    iso: 400,
    bitrate: 4.8
  });

  // Dynamic system time
  const [systemTime, setSystemTime] = useState(new Date().toLocaleTimeString("en-US"));

  // Typing animation states
  const [typingText, setTypingText] = useState("");
  const fullText = "AI License Plate Recognition System";
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
      }, 60);
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

  // Flash license plate
  useEffect(() => {
    const interval = setInterval(() => {
      setPlateFlash(true);
      setTimeout(() => setPlateFlash(false), 900);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Randomize camera metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({
        fps: +(60.0 - Math.random() * 0.4).toFixed(1),
        latency: Math.floor(10 + Math.random() * 6),
        iso: Math.floor(395 + Math.random() * 10),
        bitrate: +(4.5 + Math.random() * 0.9).toFixed(1)
      });
      setSystemTime(new Date().toLocaleTimeString("en-US"));
    }, 1500);
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
        setMessage("Invalid username or password.");
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

      <div className="auth-card-container">
        <section
          ref={cardRef}
          className="card"
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: "1040px",
            width: "95%",
            padding: 0,
            overflow: "hidden",
            transition: "box-shadow 0.3s ease, border-color 0.3s ease",
          }}
        >
          <div className="auth-grid" style={{ padding: "2rem" }}>
            {/* LEFT COLUMN: HIGH-TECH VISUALIZER */}
            <div className="card-visual">
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Camera size={20} style={{ color: "var(--accent-2)" }} />
                    <span style={{ fontWeight: 600, letterSpacing: "0.05em", fontFamily: "var(--font-head)" }}>LANECAM #01A</span>
                    <span className="badge" style={{ background: "var(--badge-live-bg, #2ed57320)", color: "var(--badge-live-text, #2ed573)", fontSize: "9px" }}>
                      <Activity size={10} style={{ animation: "pulse 1.5s infinite" }} /> LIVE
                    </span>
                  </div>
                  <ThemeToggle />
                </div>

                {/* SCI-FI CAMERA VIEWFINDER */}
                <div className="camera-viewfinder-container">
                  <div className="viewfinder-corner tl"></div>
                  <div className="viewfinder-corner tr"></div>
                  <div className="viewfinder-corner bl"></div>
                  <div className="viewfinder-corner br"></div>

                  <div className="camera-viewfinder-overlay">
                    <div className="camera-header-stats">
                      <div className="camera-rec-container">
                        <div className="camera-rec-dot"></div>
                        <span>REC 1080P</span>
                      </div>
                      <div>FPS: {metrics.fps}</div>
                    </div>

                    <div className="camera-crosshair">
                      <div className="camera-crosshair-circle"></div>
                    </div>

                    <div className="camera-footer-stats">
                      <div>UTC: {systemTime}</div>
                      <div className="camera-tech-metrics">
                        <div>ISO {metrics.iso}</div>
                        <div>LATENCY: {metrics.latency}ms</div>
                        <div>RATE: {metrics.bitrate} Mbps</div>
                      </div>
                    </div>
                  </div>

                  <div className="scanner" style={{ margin: 0, border: "none", background: "rgba(6, 10, 18, 0.6)" }}>
                    <div className="led-grid"></div>
                    <div className="scanner-row">
                      <span>LANE STREAM #1</span>
                      <span>PLATE DETECTION</span>
                    </div>
                    <div className="scanner-track" style={{ marginTop: "1rem" }}>
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
                </div>
              </div>

              {/* STATS MATRIX */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem", gap: "1rem" }}>
                <div className="stat-card" style={{ flex: 1, padding: "10px", borderRadius: "12px", background: "var(--stat-card-bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Cpu size={12} style={{ color: "var(--accent-2)" }} />
                    <span className="stat-label" style={{ fontSize: "10px" }}>Detections</span>
                  </div>
                  <div className="stat-value" style={{ fontSize: "1.6rem", fontWeight: 700 }}>142</div>
                </div>
                <div className="stat-card" style={{ flex: 1, padding: "10px", borderRadius: "12px", background: "var(--stat-card-bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Shield size={12} style={{ color: "var(--error)" }} />
                    <span className="stat-label" style={{ fontSize: "10px" }}>Alerts</span>
                  </div>
                  <div className="stat-value" style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--error)" }}>3</div>
                </div>
                <div className="stat-card" style={{ flex: 1, padding: "10px", borderRadius: "12px", background: "var(--stat-card-bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Server size={12} style={{ color: "var(--success)" }} />
                    <span className="stat-label" style={{ fontSize: "10px" }}>Health</span>
                  </div>
                  <div className="stat-value" style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--success)" }}>98.9%</div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: LOGIN FORM */}
            <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="card-head" style={{ marginBottom: "1rem" }}>
                <span className="eyebrow" style={{ fontSize: "11px", letterSpacing: "0.3em" }}>Surveillance Dashboard</span>
                <span className="badge">
                  <Shield size={10} /> SECURE
                </span>
              </div>

              <h1 style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "28px", fontWeight: 700 }}>
                <LogIn size={24} style={{ color: "var(--accent-2)" }} /> Sign In
              </h1>
              <div className="typed-wrapper" style={{ marginBottom: "1.5rem", minHeight: "24px" }}>
                <span className="typed-text" style={{ fontSize: "14px", fontWeight: 500 }}>{typingText}</span>
                <span className={`typed-cursor ${showCursor ? "visible" : "hidden"}`}>|</span>
              </div>

              <form className="form" onSubmit={handleSubmit} style={{ gap: "1rem" }}>
                {/* USERNAME FIELD */}
                <div className="field floating-group">
                  <div className={`input-wrapper ${focusedField === "username" ? "focused" : ""} ${form.username ? "has-value" : ""}`}>
                    <span className="input-icon">
                      <User size={16} className={focusedField === "username" ? "icon-focus" : ""} />
                    </span>
                    <input
                      id="login-username"
                      name="username"
                      placeholder=" "
                      value={form.username}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("username")}
                      onBlur={() => setFocusedField(null)}
                      autoComplete="username"
                    />
                    <label htmlFor="login-username">Username</label>
                  </div>
                </div>

                {/* PASSWORD FIELD */}
                <div className="field floating-group">
                  <div className={`input-wrapper ${focusedField === "password" ? "focused" : ""} ${form.password ? "has-value" : ""}`}>
                    <span className="input-icon">
                      <Lock size={16} className={focusedField === "password" ? "icon-focus" : ""} />
                    </span>
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder=" "
                      value={form.password}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      autoComplete="current-password"
                    />
                    <label htmlFor="login-password">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* REMEMBER & FORGOT PASSWORD */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "12px", color: "var(--muted)" }}>
                    <input
                      type="checkbox"
                      style={{
                        width: "14px",
                        height: "14px",
                        accentColor: "var(--accent-2)",
                        margin: 0,
                        cursor: "pointer",
                      }}
                    />
                    <span>Remember me</span>
                  </label>
                  <a href="#" className="animated-link" style={{ fontSize: "12px" }}>Forgot password?</a>
                </div>

                {/* FEEDBACK MESSAGES */}
                {messageType === "success" && (
                  <div style={{ fontSize: "12px", color: "var(--success)", display: "flex", alignItems: "center", gap: 6, padding: "4px 0", animation: "fadeSlideUp 0.3s ease" }}>
                    <CheckCircle size={14} /> {message}
                  </div>
                )}
                {messageType === "error" && (
                  <div style={{ fontSize: "12px", color: "var(--error)", display: "flex", alignItems: "center", gap: 6, padding: "4px 0", animation: "fadeSlideUp 0.3s ease" }}>
                    <Shield size={14} style={{ color: "var(--error)" }} /> {message}
                  </div>
                )}
                {messageType === "muted" && <div className="message muted" style={{ minHeight: "16px" }}> </div>}

                {/* SUBMIT BUTTON */}
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
                    borderRadius: "10px",
                    boxShadow: "0 8px 20px rgba(242, 144, 60, 0.25)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {loading ? (
                    <>
                      <span className="radar-spinner" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <LogIn size={16} /> Sign In
                      <span className="btn-shimmer"></span>
                    </>
                  )}
                </button>
              </form>

              {/* FOOTER */}
              <div className="form-footer" style={{ marginTop: "2rem", display: "flex", justifyContent: "center", gap: 6, fontSize: "13px" }}>
                <span style={{ color: "var(--muted)" }}>New here?</span>
                <Link to="/register" className="animated-link">Create an account</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}