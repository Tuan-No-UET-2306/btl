import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { authApi } from "../api/client";
import { setAuth } from "../utils/auth";
import { LogIn, Shield, Eye, EyeOff, CheckCircle, User, Lock } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("muted"); // "muted" | "error" | "success"
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Show success message if redirected from registration
  useEffect(() => {
    if (location.state?.registered) {
      setMessage("Account created successfully! Please sign in.");
      setMessageType("success");
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

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

  return (
    <main className="page auth-page" style={{ position: "relative" }}>
      {/* Floating animated orbs */}
      <div className="floating-orbs">
        <div className="floating-orb" />
        <div className="floating-orb" />
        <div className="floating-orb" />
      </div>

      <section className="card" style={{ position: "relative", zIndex: 1 }}>
        <div className="card-head">
          <span className="eyebrow">Welcome back</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeToggle />
            <span className="badge">
              <Shield size={10} /> LPR
            </span>
          </div>
        </div>

        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogIn size={24} style={{ color: "var(--accent-2)" }} /> Login
        </h1>
        <p className="muted">Sign in to manage detections and camera streams.</p>

        <div className="chip-row">
          <button className="chip active" type="button">Live cams</button>
          <button className="chip" type="button">Alerts</button>
          <button className="chip" type="button">History</button>
        </div>

        <div className="scanner">
          <div className="scanner-row">
            <span>Live lane</span>
            <span>Plate scan</span>
          </div>
          <div className="lane"></div>
          <div className="car">
            <div className="car-body">
              <span className="plate">29A-123.45</span>
              <span className="car-wheel left"></span>
              <span className="car-wheel right"></span>
            </div>
          </div>
          <div className="scan-line"></div>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="login-username">Username</label>
            <div className="input-wrapper">
              <span className="input-icon">
                <User size={16} />
              </span>
              <input
                id="login-username"
                name="username"
                placeholder="Your username"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <div className="input-wrapper">
              <span className="input-icon">
                <Lock size={16} />
              </span>
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                style={{ paddingLeft: 36, paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Success message */}
          {messageType === "success" && (
            <div style={{ fontSize: 12, color: "#2ed573", display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
              <CheckCircle size={14} /> {message}
            </div>
          )}

          {/* Error message */}
          {messageType === "error" && (
            <div style={{ fontSize: 12, color: "#ff6b6b", minHeight: 16 }}>
              {message}
            </div>
          )}

          {/* Placeholder */}
          {messageType === "muted" && (
            <div className="message muted"> </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ padding: "12px 16px" }}>
            {loading ? (
              <>
                <span className="spinner" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn size={16} /> Sign in
              </>
            )}
          </button>
        </form>

        <div className="form-footer">
          <span>New here?</span>
          <Link to="/register" style={{ color: "var(--accent-2)", fontWeight: 600 }}>Create an account</Link>
        </div>
      </section>
    </main>
  );
}