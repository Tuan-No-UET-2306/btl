import { NavLink } from "react-router-dom";
import { LayoutDashboard, ScanLine, History, Ban, Camera, Video, Shield, ShieldAlert, FileText, Users, Activity } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { getCachedProfile } from "../utils/auth";

const navLinkClass = ({ isActive }) =>
  isActive ? "nav-link active" : "nav-link";

const publicLinks = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/traffic", label: "Traffic", icon: ShieldAlert },
  { to: "/complaints", label: "Complaints", icon: FileText },
  { to: "/lpr", label: "LPR Recognition", icon: ScanLine },
  { to: "/video", label: "Video", icon: Video },
  { to: "/history", label: "History", icon: History },
  { to: "/blacklist", label: "Blacklist", icon: Ban },
  { to: "/webcam", label: "Webcam", icon: Camera },
];

const adminLinks = [
  { to: "/admin", label: "Operations", icon: Activity },
  { to: "/users", label: "Users", icon: Users },
];

export default function Sidebar() {
  const { role } = getCachedProfile();
  const isAdmin = role === "admin";

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Shield size={18} />
        </div>
        <span>LPR System</span>
      </div>
      <nav className="nav">
        {publicLinks.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink key={link.to} to={link.to} className={navLinkClass} end={link.to === "/dashboard"}>
              <Icon size={20} />
              <span>{link.label}</span>
            </NavLink>
          );
        })}
        {isAdmin && (
          <>
            <div className="nav-section-label">Admin</div>
            {adminLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink key={link.to} to={link.to} className={navLinkClass}>
                  <Icon size={20} />
                  <span>{link.label}</span>
                </NavLink>
              );
            })}
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span className={`status-badge ${isAdmin ? "error" : "info"}`} style={{ fontSize: 10, padding: "1px 8px" }}>
            {isAdmin ? "Admin" : "User"}
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {getCachedProfile().username}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.3em", textTransform: "uppercase" }}>
          LPR v1.0
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
