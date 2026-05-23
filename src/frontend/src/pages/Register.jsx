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
  const fullText = "Join our high-speed LPR network";
  const [typingIndex, setTypingIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (typingIndex < fullText.length) {
      const timeout = setTimeout(() => {
        setTypingText((prev) => prev + fullText[typingIndex]);
        setTypingIndex(typingIndex + 1);
      }, 60);
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
      setMessage("Please fill in all required fields.");
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
      if (error.code === "conflict" || error.status === 409) {
        setMessage(`Username "${form.username}" is already taken.`);
      } else if (error.code === "validation_error") {
        const fieldErrors = error.errors?.map((e) => e.message).join(", ");
        setMessage(fieldErrors || "Invalid input.");
      } else {
        setMessage(error.message || "Registration failed. Please try again.");
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
    { label: "Recommended 10+ characters", test: form.password.length >= 10 },
    { label: "Contains uppercase letter (A-Z)", test: /[A-Z]/.test(form.password) },
    { label: "Contains a number (0-9)", test: /[0-9]/.test(form.password) },
    { label: "Contains special character (@, #, ...)", test: /[^A-Za-z0-9]/.test(form.password) },
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
            {/* LEFT COLUMN: SYSTEM FEATURES & BENEFITS */}
            <div className="card-visual">
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Sparkles size={20} style={{ color: "var(--accent-2)" }} />
                    <span style={{ fontWeight: 600, letterSpacing: "0.05em", fontFamily: "var(--font-head)" }}>KEY BENEFITS</span>
                  </div>
                  <ThemeToggle />
                </div>

                <div style={{ margin: "1rem 0" }}>
                  <h2 style={{ fontSize: "1.8rem", fontWeight: 700, lineHeight: 1.2, marginBottom: "1.5rem", fontFamily: "var(--font-head)" }}>
                    Unlock the power of <span style={{ color: "var(--accent-2)" }}>intelligent detection</span>
                  </h2>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "1rem" }}>
                    {/* BENEFIT CARD 1 */}
                    <div className="benefit-card">
                      <div className="benefit-icon-container">
                        <Zap size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: 2 }}>Real-Time Detection</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>High-accuracy livestream analysis with sub-15ms processing latency.</div>
                      </div>
                    </div>

                    {/* BENEFIT CARD 2 */}
                    <div className="benefit-card">
                      <div className="benefit-icon-container" style={{ color: "var(--success)", borderColor: "rgba(46, 213, 115, 0.25)", background: "rgba(46, 213, 115, 0.08)" }}>
                        <Activity size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: 2 }}>Advanced Analytics & Reports</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>Effortlessly search history, track watchlists, and export detailed reports.</div>
                      </div>
                    </div>

                    {/* BENEFIT CARD 3 */}
                    <div className="benefit-card">
                      <div className="benefit-icon-container" style={{ color: "var(--accent)", borderColor: "rgba(244, 177, 82, 0.25)", background: "rgba(244, 177, 82, 0.08)" }}>
                        <Trophy size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: 2 }}>Operator Control Panel</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>Intuitive operator cockpit displaying active lanes, stats, and diagnostic metrics.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* FOOTER STATS */}
              <div className="stat-card" style={{ padding: "12px", borderRadius: "12px", background: "var(--stat-card-bg)", textAlign: "center", border: "1px solid var(--stroke)" }}>
                <div className="stat-label" style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>LPR Operator Community</div>
                <div className="stat-value" style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: 4 }}>Monitoring 2,300+ lanes across Vietnam</div>
              </div>
            </div>

            {/* RIGHT COLUMN: REGISTER FORM */}
            <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="card-head" style={{ marginBottom: "1rem" }}>
                <span className="eyebrow" style={{ fontSize: "11px", letterSpacing: "0.3em" }}>Account Setup</span>
                <span className="badge">
                  <Shield size={10} /> SECURE
                </span>
              </div>

              <h1 style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "28px", fontWeight: 700 }}>
                <UserPlus size={24} style={{ color: "var(--accent)" }} /> Register
              </h1>
              <div className="typed-wrapper" style={{ marginBottom: "1.5rem", minHeight: "24px" }}>
                <span className="typed-text" style={{ fontSize: "14px", fontWeight: 500, background: "linear-gradient(135deg, var(--accent), #f0833e)", WebkitBackgroundClip: "text", color: "transparent" }}>{typingText}</span>
                <span className={`typed-cursor ${showCursor ? "visible" : "hidden"}`} style={{ backgroundColor: "var(--accent)", color: "var(--accent)" }}>|</span>
              </div>

              <form className="form" onSubmit={handleSubmit} style={{ gap: "1rem" }}>
                {/* USERNAME FIELD */}
                <div className="field floating-group">
                  <div className={`input-wrapper ${focusedField === "username" ? "focused" : ""} ${form.username ? "has-value" : ""}`}>
                    <span className="input-icon">
                      <User size={16} className={focusedField === "username" ? "icon-focus" : ""} />
                    </span>
                    <input
                      id="register-username"
                      name="username"
                      placeholder=" "
                      value={form.username}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("username")}
                      onBlur={() => setFocusedField(null)}
                      autoComplete="username"
                      minLength={3}
                    />
                    <label htmlFor="register-username">Username</label>
                  </div>
                </div>

                {/* PASSWORD FIELD */}
                <div className="field floating-group">
                  <div className={`input-wrapper ${focusedField === "password" ? "focused" : ""} ${form.password ? "has-value" : ""}`}>
                    <span className="input-icon">
                      <Lock size={16} className={focusedField === "password" ? "icon-focus" : ""} />
                    </span>
                    <input
                      id="register-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder=" "
                      value={form.password}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      autoComplete="new-password"
                      minLength={6}
                    />
                    <label htmlFor="register-password">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* PASSWORD STRENGTH */}
                  {form.password && (
                    <div style={{ marginTop: 10, animation: "fadeSlideUp 0.3s ease" }}>
                      <div style={{ height: 4, borderRadius: 4, background: "var(--stroke)", overflow: "hidden", marginBottom: 6 }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${(strength / 5) * 100}%`,
                            borderRadius: 4,
                            background: strength <= 2 ? "var(--error)" : strength <= 3 ? "var(--warning)" : "var(--success)",
                            transition: "width 300ms ease",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, marginBottom: 8 }}>
                        <span style={{ color: "var(--muted)" }}>Password strength:</span>
                        <span style={{ fontWeight: 600, color: strength <= 2 ? "var(--error)" : strength <= 3 ? "var(--warning)" : "var(--success)" }}>
                          {strength <= 2 ? "Weak" : strength <= 3 ? "Medium" : "Strong"}
                        </span>
                      </div>
                      <div style={{ display: "grid", gap: 4, background: "rgba(255, 255, 255, 0.02)", padding: "10px", borderRadius: "8px", border: "1px solid var(--stroke)" }}>
                        {passwordCriteria.map((criterion, idx) => (
                          <div
                            key={idx}
                            className={`password-criteria-item ${criterion.test ? "active" : ""}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: "11px",
                              color: criterion.test ? "var(--success)" : "var(--muted)",
                            }}
                          >
                            {criterion.test ? (
                              <CheckCircle size={12} style={{ color: "var(--success)" }} />
                            ) : (
                              <XCircle size={12} style={{ color: "var(--muted)", opacity: 0.5 }} />
                            )}
                            <span>{criterion.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* CONFIRM PASSWORD FIELD */}
                <div className="field floating-group">
                  <div className={`input-wrapper ${focusedField === "confirm" ? "focused" : ""} ${form.confirm ? "has-value" : ""}`}>
                    <span className="input-icon">
                      <Lock size={16} className={focusedField === "confirm" ? "icon-focus" : ""} />
                    </span>
                    <input
                      id="register-confirm"
                      name="confirm"
                      type={showConfirm ? "text" : "password"}
                      placeholder=" "
                      value={form.confirm}
                      onChange={handleChange}
                      onFocus={() => setFocusedField("confirm")}
                      onBlur={() => setFocusedField(null)}
                      autoComplete="new-password"
                    />
                    <label htmlFor="register-confirm">Confirm Password</label>
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="password-toggle"
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.confirm && form.password !== form.confirm && (
                    <div style={{ fontSize: 11, color: "var(--error)", marginTop: 6, display: "flex", alignItems: "center", gap: 4, animation: "fadeSlideUp 0.2s ease" }}>
                      <AlertCircle size={12} /> Passwords do not match
                    </div>
                  )}
                  {form.confirm && form.password === form.confirm && (
                    <div style={{ fontSize: 11, color: "var(--success)", marginTop: 6, display: "flex", alignItems: "center", gap: 4, animation: "fadeSlideUp 0.2s ease" }}>
                      <CheckCircle size={12} /> Passwords match
                    </div>
                  )}
                </div>

                {/* FEEDBACK MESSAGES */}
                {messageType === "error" && (
                  <div style={{ fontSize: "12px", color: "var(--error)", display: "flex", alignItems: "center", gap: 6, padding: "4px 0", animation: "fadeSlideUp 0.3s ease" }}>
                    <AlertCircle size={14} style={{ color: "var(--error)" }} /> {message}
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
                    background: "var(--btn-warm)",
                    boxShadow: "0 8px 20px rgba(242, 144, 60, 0.25)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {loading ? (
                    <>
                      <span className="radar-spinner" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} /> Create Account
                      <span className="btn-shimmer"></span>
                    </>
                  )}
                </button>
              </form>

              {/* FOOTER */}
              <div className="form-footer" style={{ marginTop: "2rem", display: "flex", justifyContent: "center", gap: 6, fontSize: "13px" }}>
                <span style={{ color: "var(--muted)" }}>Already have an account?</span>
                <Link to="/" className="animated-link">Sign In</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}