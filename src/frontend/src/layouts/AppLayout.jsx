import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import { authApi } from "../api/client";
import { clearAuth, getCachedProfile } from "../utils/auth";
import { LogOut, User, ShieldCheck } from "lucide-react";

export default function AppLayout() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(getCachedProfile());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((data) => {
        if (!active || !data) return;
        setProfile({
          username: data.username || "Operator",
          role: data.role || "user",
        });
      })
      .catch(() => {
        clearAuth();
        navigate("/");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <div className="top-row">
          <div>
            <div className="eyebrow">LPR console</div>
            <h2>Operations</h2>
            <div className="subtle">Live operations and detection events.</div>
          </div>
          <div className="profile">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--accent-2), var(--accent-3))",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#050607",
                }}
              >
                {profile.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="profile-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {profile.username}
                  <ShieldCheck size={12} style={{ color: "var(--accent-2)" }} />
                </div>
                <div className="profile-role">{profile.role.toUpperCase()}</div>
              </div>
            </div>
            <button type="button" className="logout" onClick={handleLogout} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
        {loading ? (
          <div style={{ display: "grid", gap: 16, padding: 24 }}>
            <div className="skeleton" style={{ height: 100 }} />
            <div className="skeleton" style={{ height: 200 }} />
            <div className="skeleton" style={{ height: 150 }} />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}