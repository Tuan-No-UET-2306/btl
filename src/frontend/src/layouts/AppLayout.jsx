import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import { authApi } from "../api/client";
import { clearAuth, getCachedProfile } from "../utils/auth";

export default function AppLayout() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(getCachedProfile());

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
            <div>
              <div className="profile-name">{profile.username}</div>
              <div className="profile-role">{profile.role.toUpperCase()}</div>
            </div>
            <button type="button" className="logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
