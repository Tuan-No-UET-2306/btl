import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { authApi } from "../api/client";
import { setAuth } from "../utils/auth";
import { LogIn, Shield, Eye, EyeOff, CheckCircle } from "lucide-react";

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
      // Clear the state so refresh doesn't show it again
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
    <main className="page auth-page">
      <section className="card">
        <div className="card-head">
          <span className="eyebrow">Welcome back</span>
          <span className="badge">
            <Shield size={10} style={{ marginRight: 4 }} /> LPR
          </span>
        </div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogIn size={22} style={{ color: "var(--accent-2)" }} /> Login
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
            <input
              id="login-username"
              name="username"
              placeholder="Your username"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                style={{ paddingRight: 36 }}
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
                }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Success message (green) */}
          {messageType === "success" && (
            <div style={{ fontSize: 12, color: "#2ed573", display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
              <CheckCircle size={14} /> {message}
            </div>
          )}

          {/* Error message (red) */}
          {messageType === "error" && (
            <div style={{ fontSize: 12, color: "#ff6b6b", minHeight: 16 }}>
              {message}
            </div>
          )}

          {/* Placeholder when no message */}
          {messageType === "muted" && (
            <div className="message muted"> </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="form-footer">
          <span>New here?</span>
          <Link to="/register" style={{ color: "var(--accent-2)" }}>Create an account</Link>
        </div>
      </section>
    </main>
  );
}