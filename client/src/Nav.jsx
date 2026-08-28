import { NavLink } from "react-router-dom";
import { ROLE_LABELS } from "./api.js";
import Icon from "./Icon.jsx";

function navClass({ isActive }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

function Nav({ user, onLogout }) {
  return (
    <header className="app-nav">
      <div className="app-nav-left">
        <span className="app-nav-brand">
          <Icon name="flask" />
          Lab Manager
        </span>
        <nav className="app-nav-links">
          <NavLink to="/" end className={navClass}>
            <Icon name="dashboard" />
            Dashboard
          </NavLink>
          <NavLink to="/inventory" className={navClass}>
            <Icon name="inventory" />
            Inventory
          </NavLink>
          <NavLink to="/categories" className={navClass}>
            <Icon name="categories" />
            Categories
          </NavLink>
          <NavLink to="/requests" className={navClass}>
            <Icon name="requests" />
            Requests
          </NavLink>
          <NavLink to="/equipment" className={navClass}>
            <Icon name="equipment" />
            Equipment
          </NavLink>
          {user?.role === "coordinator" && (
            <NavLink to="/members" className={navClass}>
              <Icon name="members" />
              Members
            </NavLink>
          )}
        </nav>
      </div>
      <div className="app-nav-right">
        <span className="app-nav-user">
          {user?.lab_name}
          {user?.role && (
            <span className={`role-badge role-badge-${user.role}`}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
          )}
        </span>
        <span className="app-nav-user app-nav-email mono">{user?.email}</span>
        <button className="btn-secondary" onClick={onLogout}>
          Log Out
        </button>
      </div>
    </header>
  );
}

export default Nav;
