import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { authApi } from "../api/client";
import { UserPlus, Shield, Eye, EyeOff } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirm: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!form.username || !form.password || !form.confirm) {
      setMessage("Please fill in all fields.");
      return;
    }

    if (form.password !== form.confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    if (form.password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await authApi.register({ username: form.username, password: form.password });
      navigate("/");
    } catch (error) {
      setMessage(error.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

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
              placeholder="Your username"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="register-password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
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
          </div>
          <div className={`message ${message ? "" : "muted"}`}>
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