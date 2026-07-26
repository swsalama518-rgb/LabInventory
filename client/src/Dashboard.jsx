import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "./api.js";

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
        <div className="stat-card">
          <span className="stat-value">{stats?.total_supplies ?? 0}</span>
          <span className="stat-label">Total Supplies</span>
        </div>
        <div className="stat-card stat-card-warning">
          <span className="stat-value">{stats?.low_stock_count ?? 0}</span>
          <span className="stat-label">Low Stock Items</span>
        </div>
        <div className="stat-card stat-card-warning">
          <span className="stat-value">{stats?.pending_requests_count ?? 0}</span>
          <span className="stat-label">Pending Requests</span>
        </div>
      </section>

      {stats?.pending_requests_count > 0 && (
        <section className="panel">
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

      <section className="panel">
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

      <section className="panel">
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
