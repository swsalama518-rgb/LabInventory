import { NavLink } from "react-router-dom";

function navClass({ isActive }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

function Nav({ user, onLogout }) {
  return (
    <header className="app-nav">
      <div className="app-nav-left">
        <span className="app-nav-brand">LabInventory</span>
        <nav className="app-nav-links">
          <NavLink to="/" end className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/inventory" className={navClass}>
            Inventory
          </NavLink>
          <NavLink to="/categories" className={navClass}>
            Categories
          </NavLink>
          <NavLink to="/requests" className={navClass}>
            Requests
          </NavLink>
        </nav>
      </div>
      <div className="app-nav-right">
        <span className="app-nav-user">
          {user?.lab_name}
          {user?.role && (
            <span className={`role-badge role-badge-${user.role}`}>{user.role}</span>
          )}
        </span>
        <span className="app-nav-user app-nav-email">{user?.email}</span>
        <button className="btn-secondary" onClick={onLogout}>
          Log Out
        </button>
      </div>
    </header>
  );
}

export default Nav;
