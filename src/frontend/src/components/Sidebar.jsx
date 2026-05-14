import { NavLink } from "react-router-dom";
import { LayoutDashboard, ScanLine, History, Ban, Camera, Video, Shield } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const navLinkClass = ({ isActive }) =>
  isActive ? "nav-link active" : "nav-link";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/lpr", label: "LPR Recognition", icon: ScanLine },
  { to: "/video", label: "Video", icon: Video },
  { to: "/history", label: "History", icon: History },
  { to: "/blacklist", label: "Blacklist", icon: Ban },
  { to: "/webcam", label: "Webcam", icon: Camera },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Shield size={18} />
        </div>
        <span>LPR System</span>
      </div>
      <nav className="nav">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink key={link.to} to={link.to} className={navLinkClass} end={link.to === "/dashboard"}>
              <Icon size={20} />
              <span>{link.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.3em", textTransform: "uppercase" }}>
          LPR v1.0
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}