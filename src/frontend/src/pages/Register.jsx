import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { authApi } from "../api/client";
import {
  UserPlus,
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  XCircle,
  User,
  Lock,
  Sparkles,
  Zap,
  Trophy,
  Activity,
} from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("muted");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const cardRef = useRef(null);

  // Typing animation
  const [typingText, setTypingText] = useState("");
  const fullText = "Create your LPR account";
  const [typingIndex, setTypingIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (typingIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setTypingText((prev) => prev + fullText[typingIndex]);
        setTypingIndex(typingIndex + 1);
      }, 70);
      return () => clearTimeout(timeout);
    }
  }, [typingIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);
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

    if (!form.username || !form.password || !form.confirm) {
      setMessage("Please fill in all fields.");
      setMessageType("error");
      return;
    }
    if (form.password !== form.confirm) {
      setMessage("Passwords do not match.");
      setMessageType("error");
      return;
    }
    if (form.password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      setMessageType("error");
      return;
    }
    if (form.username.length < 3) {
      setMessage("Username must be at least 3 characters.");
      setMessageType("error");
      return;
    }

    setLoading(true);
    try {
      await authApi.register({ username: form.username, password: form.password });
      navigate("/", { state: { registered: true } });
    } catch (error) {
      if (error.code === "conflict") {
        setMessage(`Username "${form.username}" is already taken.`);
      } else if (error.code === "validation_error") {
        const fieldErrors = error.errors?.map((e) => e.message).join(", ");
        setMessage(fieldErrors || "Invalid input.");
      } else {
        setMessage(error.message || "Registration failed.");
      }
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (pwd) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = getPasswordStrength(form.password);
  const passwordCriteria = [
    { label: "At least 6 characters", test: form.password.length >= 6 },
    { label: "At least 10 characters", test: form.password.length >= 10 },
    { label: "Contains uppercase letter", test: /[A-Z]/.test(form.password) },
    { label: "Contains a number", test: /[0-9]/.test(form.password) },
    { label: "Contains special character", test: /[^A-Za-z0-9]/.test(form.password) },
  ];

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

  const handleSocialLogin = (provider) => {
    alert(`Demo: ${provider} login would be integrated here.`);
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
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={20} style={{ color: "var(--accent-2)" }} />
                  <span style={{ fontWeight: 600 }}>Why join LPR?</span>
                </div>
                <ThemeToggle />
              </div>
              <div style={{ margin: "2rem 0" }}>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "1rem" }}>
                  Unlock the future of <span style={{ color: "var(--accent-2)" }}>license plate recognition</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Zap size={24} style={{ color: "var(--warning)" }} />
                    <span>Real‑time detection & alerts</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Activity size={24} style={{ color: "var(--success)" }} />
                    <span>Historical search & reporting</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Trophy size={24} style={{ color: "var(--accent)" }} />
                    <span>Operator dashboards & analytics</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="stat-card" style={{ textAlign: "center" }}>
              <div className="stat-label">Join 500+ operators</div>
              <div className="stat-value">Monitoring 2,300+ lanes</div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ padding: "0.5rem" }}>
            <div className="card-head" style={{ marginBottom: "1rem" }}>
              <span className="eyebrow">Get started</span>
              <span className="badge">
                <Shield size={10} /> LPR
              </span>
            </div>

            <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <UserPlus size={24} style={{ color: "var(--accent)" }} /> Create account
            </h1>
            <div className="typed-wrapper" style={{ marginBottom: "1.5rem", minHeight: "24px" }}>
              <span className="typed-text">{typingText}</span>
              <span className={`typed-cursor ${showCursor ? "visible" : "hidden"}`}>|</span>
            </div>

            <form className="form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="register-username">Username</label>
                <div className={`input-wrapper ${focusedField === "username" ? "focused" : ""}`}>
                  <span className="input-icon">
                    <User size={16} className={focusedField === "username" ? "icon-focus" : ""} />
                  </span>
                  <input
                    id="register-username"
                    name="username"
                    placeholder="Choose a username (min. 3 characters)"
                    value={form.username}
                    onChange={handleChange}
                    onFocus={() => setFocusedField("username")}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="username"
                    minLength={3}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="register-password">Password</label>
                <div className={`input-wrapper ${focusedField === "password" ? "focused" : ""}`}>
                  <span className="input-icon">
                    <Lock size={16} className={focusedField === "password" ? "icon-focus" : ""} />
                  </span>
                  <input
                    id="register-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password (min. 6 characters)"
                    value={form.password}
                    onChange={handleChange}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="new-password"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.password && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 3, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${(strength / 5) * 100}%`,
                          borderRadius: 3,
                          background: strength <= 2 ? "var(--error)" : strength <= 3 ? "var(--warning)" : "var(--success)",
                          transition: "width 300ms ease",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 10, marginTop: 3, color: strength <= 2 ? "var(--error)" : strength <= 3 ? "var(--warning)" : "var(--success)" }}>
                      {strength <= 2 ? "Weak" : strength <= 3 ? "Medium" : "Strong"}
                    </div>
                    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                      {passwordCriteria.map((criterion, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: criterion.test ? "var(--success)" : "var(--muted)" }}>
                          {criterion.test ? <CheckCircle size={11} /> : <XCircle size={11} />}
                          {criterion.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="register-confirm">Confirm password</label>
                <div className={`input-wrapper ${focusedField === "confirm" ? "focused" : ""}`}>
                  <span className="input-icon">
                    <Lock size={16} className={focusedField === "confirm" ? "icon-focus" : ""} />
                  </span>
                  <input
                    id="register-confirm"
                    name="confirm"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repeat the password"
                    value={form.confirm}
                    onChange={handleChange}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="password-toggle"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.confirm && form.password !== form.confirm && (
                  <div style={{ fontSize: 11, color: "var(--error)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <AlertCircle size={12} /> Passwords do not match
                  </div>
                )}
                {form.confirm && form.password === form.confirm && (
                  <div style={{ fontSize: 11, color: "var(--success)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle size={12} /> Passwords match
                  </div>
                )}
              </div>

              <div className={`message ${messageType === "error" ? "" : "muted"}`} style={messageType === "error" ? { color: "var(--error)" } : {}}>
                {message || " "}
              </div>

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
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> Create account
                    <span className="btn-shimmer"></span>
                  </>
                )}
              </button>

              {/* Social Login Mock */}
            </form>

            <div className="form-footer" style={{ marginTop: "1.5rem" }}>
              <span>Already have an account?</span>
              <Link to="/" className="animated-link">Sign in</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}