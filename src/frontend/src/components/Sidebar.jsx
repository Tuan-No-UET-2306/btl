import { NavLink } from "react-router-dom";

const navLinkClass = ({ isActive }) =>
  isActive ? "nav-link active" : "nav-link";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">LPR System</div>
      <nav className="nav">
        <NavLink to="/dashboard" className={navLinkClass} end>
          Dashboard
        </NavLink>
        <NavLink to="/lpr" className={navLinkClass}>
          LPR Recognition
        </NavLink>
        <NavLink to="/history" className={navLinkClass}>
          History
        </NavLink>
        <NavLink to="/blacklist" className={navLinkClass}>
          Blacklist
        </NavLink>
      </nav>
    </aside>
  );
}
