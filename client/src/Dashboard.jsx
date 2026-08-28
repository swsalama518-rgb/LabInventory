import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "./api.js";
import Icon from "./Icon.jsx";

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => setStats(res.data))
      .catch(() => setError("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="page-loading">Loading dashboard...</div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>

      {error && <div className="auth-error">{error}</div>}

      <section className="stats-row">
        <div className="stat-card stat-card-blue">
          <span className="stat-card-icon">
            <Icon name="box" />
          </span>
          <span className="stat-card-body">
            <span className="stat-value">{stats?.total_supplies ?? 0}</span>
            <span className="stat-label">Total Supplies</span>
          </span>
        </div>
        {stats?.total_incubators > 0 && (
          <div className="stat-card stat-card-green">
            <span className="stat-card-icon">
              <Icon name="incubator" />
            </span>
            <span className="stat-card-body">
              <span className="stat-value">
                {stats.available_incubators}/{stats.total_incubators}
              </span>
              <span className="stat-label">Incubators Available</span>
            </span>
          </div>
        )}
        <div className="stat-card stat-card-warning">
          <span className="stat-card-icon">
            <Icon name="warning" />
          </span>
          <span className="stat-card-body">
            <span className="stat-value">{stats?.low_stock_count ?? 0}</span>
            <span className="stat-label">Low Stock Items</span>
          </span>
        </div>
        <div className="stat-card stat-card-purple">
          <span className="stat-card-icon">
            <Icon name="clock" />
          </span>
          <span className="stat-card-body">
            <span className="stat-value">{stats?.pending_requests_count ?? 0}</span>
            <span className="stat-label">Pending Requests</span>
          </span>
        </div>
        <div className="stat-card stat-card-teal">
          <span className="stat-card-icon">
            <Icon name="flask" />
          </span>
          <span className="stat-card-body">
            <span className="stat-value">{stats?.active_incubations_count ?? 0}</span>
            <span className="stat-label">Active Incubations</span>
          </span>
        </div>
      </section>

      {stats?.overdue_incubations?.length > 0 && (
        <section className="panel panel-teal">
          <div className="panel-header">
            <h2>Samples Ready for Pickup</h2>
            <Link className="btn-link" to="/equipment">
              View equipment log
            </Link>
          </div>
          <ul className="list-plain">
            {stats.overdue_incubations.map((log) => (
              <li key={log.id}>
                <span>
                  {log.sample_name} ({log.sample_count})
                  {log.researcher_name ? ` — ${log.researcher_name}` : ""}
                </span>
                <span className="list-meta">
                  {log.equipment_name} · done {new Date(log.ends_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats?.pending_requests_count > 0 && (
        <section className="panel panel-purple">
          <div className="panel-header">
            <h2>Restock Requests Awaiting Review</h2>
            <Link className="btn-link" to="/requests">
              View requests
            </Link>
          </div>
          <p className="empty-state">
            {stats.pending_requests_count} request
            {stats.pending_requests_count === 1 ? "" : "s"} pending.
          </p>
        </section>
      )}

      <section className="panel panel-amber">
        <div className="panel-header">
          <h2>Low Stock Items</h2>
          <Link className="btn-link" to="/inventory">
            View inventory
          </Link>
        </div>
        {stats?.low_stock_items?.length ? (
          <ul className="list-plain">
            {stats.low_stock_items.map((s) => (
              <li key={s.id}>
                <span>{s.name}</span>
                <span className="list-meta">
                  {s.quantity} {s.unit || ""} · {s.category_name || "Uncategorized"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">Nothing is low on stock right now.</p>
        )}
      </section>

      <section className="panel panel-blue">
        <div className="panel-header">
          <h2>Recently Updated</h2>
        </div>
        {stats?.recent_updates?.length ? (
          <ul className="list-plain">
            {stats.recent_updates.map((s) => (
              <li key={s.id}>
                <span>{s.name}</span>
                <span className="list-meta">
                  {s.quantity} {s.unit || ""} · {s.category_name || "Uncategorized"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No supplies yet. Add your first one in Inventory.</p>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
