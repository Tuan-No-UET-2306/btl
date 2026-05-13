import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { authApi } from "../api/client";
import { UserPlus, Shield, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirm: "",
  });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("muted"); // "muted" | "error" | "success"
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear message when user starts typing
    if (message) {
      setMessage("");
      setMessageType("muted");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    // Client-side validation
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
      // Success - redirect with flash
      navigate("/", { state: { registered: true } });
    } catch (error) {
      // Handle specific error codes
      if (error.code === "conflict") {
        setMessage(`Username "${form.username}" is already taken. Please choose another.`);
      } else if (error.code === "validation_error") {
        const fieldErrors = error.errors?.map((e) => e.message).join(", ");
        setMessage(fieldErrors || "Invalid input. Please check your information.");
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

  return (
    <main className="page auth-page">
      <section className="card">
        <div className="card-head">
          <span className="eyebrow">Get started</span>
          <span className="badge">
            <Shield size={10} style={{ marginRight: 4 }} /> LPR
          </span>
        </div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <UserPlus size={22} style={{ color: "var(--accent)" }} /> Create account
        </h1>
        <p className="muted">Set up a new operator profile for the LPR platform.</p>

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="register-username">Username</label>
            <input
              id="register-username"
              name="username"
              placeholder="Choose a username (min. 3 characters)"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
              minLength={3}
            />
          </div>
          <div className="field">
            <label htmlFor="register-password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password (min. 6 characters)"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
                style={{ paddingRight: 36 }}
                minLength={6}
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
            {/* Password strength indicator */}
            {form.password && form.password.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    height: 3,
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(strength / 5) * 100}%`,
                      borderRadius: 3,
                      background:
                        strength <= 2
                          ? "#ff6b6b"
                          : strength <= 3
                          ? "#ffd28b"
                          : "#2ed573",
                      transition: "width 300ms ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 10,
                    marginTop: 3,
                    color:
                      strength <= 2
                        ? "#ff6b6b"
                        : strength <= 3
                        ? "#ffd28b"
                        : "#2ed573",
                  }}
                >
                  {strength <= 2
                    ? "Weak"
                    : strength <= 3
                    ? "Medium"
                    : "Strong"}
                </div>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="register-confirm">Confirm password</label>
            <div style={{ position: "relative" }}>
              <input
                id="register-confirm"
                name="confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="Repeat the password"
                value={form.confirm}
                onChange={handleChange}
                autoComplete="new-password"
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
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
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {/* Match indicator */}
            {form.confirm && form.password !== form.confirm && (
              <div style={{ fontSize: 11, color: "#ff6b6b", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={12} /> Passwords do not match
              </div>
            )}
            {form.confirm && form.password === form.confirm && (
              <div style={{ fontSize: 11, color: "#2ed573", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle size={12} /> Passwords match
              </div>
            )}
          </div>
          <div className={`message ${messageType === "error" ? "" : "muted"}`} style={messageType === "error" ? { color: "#ff6b6b" } : {}}>
            {message || " "}
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <div className="form-footer">
          <span>Already have an account?</span>
          <Link to="/" style={{ color: "var(--accent-2)" }}>Sign in</Link>
        </div>
      </section>
    </main>
  );
}