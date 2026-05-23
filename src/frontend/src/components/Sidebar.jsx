// Sidebar.jsx
import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ScanLine,
  History,
  Ban,
  Camera,
  Video,
  Shield,
  ShieldAlert,
  FileText,
  Users,
  Activity,
  Sparkles,
  Menu,
  ChevronLeft,
} from "lucide-react";
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
  const { role, username } = getCachedProfile();
  const isAdmin = role === "admin";
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });
  const [ripples, setRipples] = useState({});

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", isCollapsed);
  }, [isCollapsed]);

  const toggleSidebar = () => setIsCollapsed((prev) => !prev);

  const handleRipple = (e, linkTo) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = `${linkTo}-${Date.now()}`;
    setRipples((prev) => ({ ...prev, [id]: { x, y, size } }));
    setTimeout(() => {
      setRipples((prev) => {
        const newRipples = { ...prev };
        delete newRipples[id];
        return newRipples;
      });
    }, 600);
  };

  return (
    <aside className={`sidebar modern-sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-glow" />

      <div className="brand">
        <div className="brand-icon">
          <Shield size={20} />
        </div>
        {!isCollapsed && (
          <>
            <span className="brand-text">LPR System</span>
            <div className="brand-badge">
              <Sparkles size={12} />
            </div>
          </>
        )}
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          {isCollapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="nav modern-nav">
        {publicLinks.map((link, idx) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.to || (link.to === "/dashboard" && location.pathname === "/");
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={navLinkClass}
              end={link.to === "/dashboard"}
              onClick={(e) => handleRipple(e, link.to)}
              style={{ animationDelay: !isCollapsed ? `${idx * 0.03}s` : "0s" }}
            >
              <span className="nav-icon">
                <Icon size={20} />
              </span>
              {!isCollapsed && <span className="nav-label">{link.label}</span>}
              <span className="nav-indicator" />
              {ripples[`${link.to}-${Date.now()}`] && (
                <span
                  className="ripple"
                  style={{
                    left: ripples[Object.keys(ripples).find(k => k.includes(link.to))]?.x,
                    top: ripples[Object.keys(ripples).find(k => k.includes(link.to))]?.y,
                    width: ripples[Object.keys(ripples).find(k => k.includes(link.to))]?.size,
                    height: ripples[Object.keys(ripples).find(k => k.includes(link.to))]?.size,
                  }}
                />
              )}
              {isCollapsed && (
                <span className="nav-tooltip">{link.label}</span>
              )}
            </NavLink>
          );
        })}

        {isAdmin && !isCollapsed && (
          <>
            <div className="nav-section-label">
              <span>Admin Zone</span>
              <div className="section-line" />
            </div>
            {adminLinks.map((link, idx) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={navLinkClass}
                  onClick={(e) => handleRipple(e, link.to)}
                  style={{ animationDelay: `${(publicLinks.length + idx) * 0.03}s` }}
                >
                  <span className="nav-icon">
                    <Icon size={20} />
                  </span>
                  <span className="nav-label">{link.label}</span>
                  <span className="nav-indicator" />
                </NavLink>
              );
            })}
          </>
        )}

        {isAdmin && isCollapsed && (
          <>
            {adminLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={navLinkClass}
                  onClick={(e) => handleRipple(e, link.to)}
                >
                  <span className="nav-icon">
                    <Icon size={20} />
                  </span>
                  <span className="nav-indicator" />
                  <span className="nav-tooltip">{link.label}</span>
                </NavLink>
              );
            })}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">
            {username?.charAt(0).toUpperCase() || "U"}
          </div>
          {!isCollapsed && (
            <div className="user-details">
              <span className="user-name">{username}</span>
            </div>
          )}
        </div>
        <div className="footer-actions">
          {!isCollapsed && <div className="version-badge">LPR v2.4</div>}
          <ThemeToggle />
        </div>
      </div>

      <style>{`
        .modern-sidebar {
          position: relative;
          background: var(--sidebar-bg);
          backdrop-filter: blur(8px);
          border-right: 1px solid var(--stroke);
          transition: width 0.35s cubic-bezier(0.2, 0.9, 0.4, 1.1);
          width: 280px;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          z-index: 100;
          box-shadow: 4px 0 20px rgba(0, 0, 0, 0.1);
        }
        .modern-sidebar.collapsed {
          width: 80px;
        }
        .sidebar-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--accent-2), var(--accent-3), var(--accent));
          opacity: 0.8;
          filter: blur(1px);
          animation: glowPulse 3s infinite;
        }
        @keyframes glowPulse {
          0% { opacity: 0.6; filter: blur(1px); }
          50% { opacity: 1; filter: blur(0px); }
          100% { opacity: 0.6; filter: blur(1px); }
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 16px 24px;
          border-bottom: 1px solid var(--stroke);
          margin-bottom: 16px;
          position: relative;
          white-space: nowrap;
          transition: all 0.3s ease;
        }
        .collapsed .brand {
          justify-content: center;
          padding: 20px 0 24px;
        }
        .brand-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--accent), var(--accent-2));
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0a0f1c;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .brand:hover .brand-icon {
          transform: scale(1.05) rotate(3deg);
          box-shadow: 0 12px 24px rgba(42, 209, 255, 0.3);
        }
        .brand-text {
          font-family: var(--font-head);
          font-size: 1.25rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--text), var(--accent-2));
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          letter-spacing: -0.3px;
          transition: opacity 0.2s;
        }
        .brand-badge {
          background: rgba(42, 209, 255, 0.12);
          border-radius: 20px;
          padding: 4px 6px;
          display: flex;
          align-items: center;
          margin-left: auto;
          animation: pulseGlow 2s infinite;
        }
        .sidebar-toggle {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: 8px;
          transition: all 0.2s;
          margin-left: auto;
        }
        .collapsed .sidebar-toggle {
          margin-left: 0;
          position: absolute;
          right: 8px;
          top: 24px;
        }
        .sidebar-toggle:hover {
          background: rgba(255,255,255,0.15);
          color: var(--accent-2);
          transform: scale(1.05);
        }
        .modern-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 0 12px;
          flex: 1;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--accent-2) transparent;
        }
        .modern-nav::-webkit-scrollbar {
          width: 4px;
        }
        .modern-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .modern-nav::-webkit-scrollbar-thumb {
          background: var(--accent-2);
          border-radius: 4px;
        }
        .collapsed .modern-nav {
          padding: 0 8px;
        }
        .modern-nav .nav-link {
          position: relative;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 16px;
          border-radius: 14px;
          color: var(--muted);
          transition: all 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1);
          overflow: hidden;
          z-index: 1;
          white-space: nowrap;
          animation: fadeSlideIn 0.3s ease backwards;
        }
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .collapsed .modern-nav .nav-link {
          justify-content: center;
          padding: 10px;
          animation: none;
        }
        .modern-nav .nav-link::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 50%, rgba(42, 209, 255, 0.12), transparent 80%);
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: -1;
          border-radius: inherit;
        }
        .modern-nav .nav-link:hover::before {
          opacity: 1;
        }
        .modern-nav .nav-link:hover {
          transform: translateX(6px);
          color: var(--text);
          background: rgba(255, 255, 255, 0.03);
        }
        .collapsed .modern-nav .nav-link:hover {
          transform: translateX(0);
          background: rgba(255, 255, 255, 0.05);
        }
        .nav-icon {
          display: inline-flex;
          transition: all 0.2s ease;
        }
        .modern-nav .nav-link:hover .nav-icon {
          transform: scale(1.15);
          filter: drop-shadow(0 0 4px rgba(42, 209, 255, 0.5));
        }
        .modern-nav .nav-link.active {
          background: linear-gradient(115deg, rgba(42, 209, 255, 0.18), rgba(111, 137, 255, 0.1));
          color: var(--text);
          border: 1px solid rgba(42, 209, 255, 0.3);
          box-shadow: 0 6px 14px rgba(42, 209, 255, 0.2);
        }
        .modern-nav .nav-link.active .nav-icon {
          color: var(--accent-2);
          filter: drop-shadow(0 0 6px rgba(42, 209, 255, 0.6));
        }
        .nav-indicator {
          position: absolute;
          right: 12px;
          width: 3px;
          height: 0px;
          background: linear-gradient(180deg, var(--accent-2), var(--accent-3));
          border-radius: 4px;
          transition: height 0.25s cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        .collapsed .nav-indicator {
          right: 4px;
        }
        .modern-nav .nav-link.active .nav-indicator {
          height: 28px;
        }
        /* Tooltip khi collapsed */
        .nav-tooltip {
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          background: var(--card-solid);
          color: var(--text);
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          border: 1px solid var(--stroke);
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          pointer-events: none;
          z-index: 200;
          margin-left: 8px;
        }
        .collapsed .nav-link:hover .nav-tooltip {
          opacity: 1;
          visibility: visible;
          transform: translateY(-50%) translateX(4px);
        }
        /* Ripple effect */
        .ripple {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transform: scale(0);
          animation: rippleAnim 0.6s linear forwards;
          pointer-events: none;
        }
        @keyframes rippleAnim {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
        .nav-section-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
          padding: 20px 12px 8px 12px;
          margin-top: 8px;
          animation: fadeSlideIn 0.3s ease backwards;
          animation-delay: 0.2s;
        }
        .section-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, var(--stroke), transparent);
          margin-left: 12px;
        }
        .sidebar-footer {
          margin-top: auto;
          padding: 20px 16px 24px;
          border-top: 1px solid var(--stroke);
          transition: all 0.3s;
        }
        .collapsed .sidebar-footer {
          padding: 20px 8px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          padding: 8px 4px;
          border-radius: 16px;
          transition: background 0.2s;
        }
        .collapsed .user-info {
          justify-content: center;
          margin-bottom: 16px;
        }
        .user-info:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .user-avatar {
          width: 42px;
          height: 42px;
          background: linear-gradient(145deg, var(--accent-2), var(--accent-3));
          border-radius: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.2rem;
          color: #0a0f1c;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .user-info:hover .user-avatar {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(42, 209, 255, 0.3);
        }
        .user-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .user-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text);
        }
        .user-role {
          font-size: 0.7rem;
          letter-spacing: 0.3px;
          padding: 2px 8px;
          border-radius: 30px;
          display: inline-block;
          width: fit-content;
        }
        .user-role.admin {
          background: rgba(255, 107, 107, 0.15);
          color: #ff6b6b;
          border: 1px solid rgba(255, 107, 107, 0.3);
        }
        .user-role.user {
          background: rgba(42, 209, 255, 0.12);
          color: var(--accent-2);
          border: 1px solid rgba(42, 209, 255, 0.25);
        }
        .footer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .collapsed .footer-actions {
          justify-content: center;
          flex-direction: column;
          gap: 12px;
        }
        .version-badge {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.2em;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px 10px;
          border-radius: 30px;
          color: var(--muted);
          border: 1px solid var(--stroke);
          white-space: nowrap;
        }
        /* Light mode adjustments */
        .light .modern-nav .nav-link.active {
          background: linear-gradient(115deg, rgba(42, 209, 255, 0.2), rgba(111, 137, 255, 0.1));
          border-color: rgba(42, 209, 255, 0.5);
          box-shadow: 0 4px 12px rgba(42, 209, 255, 0.15);
        }
        .light .user-avatar {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }
        .light .modern-nav .nav-link:hover {
          background: rgba(0, 0, 0, 0.03);
        }
        @keyframes pulseGlow {
          0% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 0.6; transform: scale(1); }
        }

        .sidebar-footer {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: auto;
          padding: 20px 16px 24px;
          border-top: 1px solid var(--stroke);
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .user-avatar {
          width: 40px;
          height: 40px;
          background: linear-gradient(145deg, var(--accent-2), var(--accent-3));
          border-radius: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.1rem;
          color: #0a0f1c;
        }
        .user-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
        }
        .footer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .collapsed .sidebar-footer {
          align-items: center;
          padding: 20px 8px 24px;
        }
        .collapsed .user-info {
          justify-content: center;
        }
        .collapsed .footer-actions {
          justify-content: center;
          flex-direction: column;
        }
      `}</style>
    </aside>
  );
}