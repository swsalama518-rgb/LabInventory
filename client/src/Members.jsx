import { useEffect, useState } from "react";
import api, { ROLE_LABELS } from "./api.js";

const ALL_ROLES = ["coordinator", "faculty", "grad_student", "undergrad", "staff"];

function Members({ user, onLabRenamed }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approveRole, setApproveRole] = useState({});

  const [labName, setLabName] = useState(user?.lab_name || "");
  const [labSaving, setLabSaving] = useState(false);
  const [labMessage, setLabMessage] = useState("");
  const [labError, setLabError] = useState("");

  function load() {
    return api.get("/lab/members").then((res) => setMembers(res.data));
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err.response?.data?.error || "Failed to load members"))
      .finally(() => setLoading(false));
  }, []);

  async function handleRenameLab(e) {
    e.preventDefault();
    setLabError("");
    setLabMessage("");
    const name = labName.trim();
    if (!name) return;
    setLabSaving(true);
    try {
      const res = await api.patch("/lab", { name });
      setLabMessage("Lab renamed.");
      onLabRenamed?.(res.data.name);
    } catch (err) {
      setLabError(err.response?.data?.error || "Failed to rename lab");
    } finally {
      setLabSaving(false);
    }
  }

  async function handleApprove(id) {
    setError("");
    try {
      await api.patch(`/lab/members/${id}`, {
        status: "approved",
        role: approveRole[id] || "staff",
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to approve member");
    }
  }

  async function handleReject(id) {
    if (!window.confirm("Reject this join request? This removes the account.")) return;
    setError("");
    try {
      await api.delete(`/lab/members/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reject member");
    }
  }

  async function handleRoleChange(id, role) {
    setError("");
    try {
      await api.patch(`/lab/members/${id}`, { role });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to change role");
    }
  }

  async function handleRemove(id) {
    if (!window.confirm("Remove this member from the lab?")) return;
    setError("");
    try {
      await api.delete(`/lab/members/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to remove member");
    }
  }

  if (loading) {
    return <div className="page-loading">Loading members...</div>;
  }

  const pending = members.filter((m) => m.status === "pending");
  const approved = members.filter((m) => m.status === "approved");

  return (
    <div className="page">
      <h1 className="page-title">Lab Members</h1>

      {error && <div className="auth-error">{error}</div>}

      <section className="panel">
        <div className="panel-header">
          <h2>Lab Settings</h2>
        </div>
        <form className="add-category-form" onSubmit={handleRenameLab}>
          <input
            type="text"
            value={labName}
            onChange={(e) => setLabName(e.target.value)}
            placeholder="Lab name"
          />
          <button className="btn-primary" type="submit" disabled={labSaving}>
            {labSaving ? "Saving..." : "Rename Lab"}
          </button>
        </form>
        {labMessage && <p className="field-hint">{labMessage}</p>}
        {labError && <div className="auth-error">{labError}</div>}
      </section>

      {pending.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>Pending requests</h2>
          </div>
          <table className="supplies-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Requested</th>
                <th>Requested role</th>
                <th>Approve as</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((m) => (
                <tr key={m.id}>
                  <td>{m.email}</td>
                  <td>{m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</td>
                  <td>{ROLE_LABELS[m.role] || m.role}</td>
                  <td>
                    <select
                      value={approveRole[m.id] || m.role}
                      onChange={(e) =>
                        setApproveRole({ ...approveRole, [m.id]: e.target.value })
                      }
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="table-actions">
                    <button className="btn-link" onClick={() => handleApprove(m.id)}>
                      Approve
                    </button>
                    <button className="btn-link btn-danger" onClick={() => handleReject(m.id)}>
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Members</h2>
        </div>
        {approved.length === 0 ? (
          <p className="empty-state">No approved members yet.</p>
        ) : (
          <table className="supplies-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {approved.map((m) => (
                <tr key={m.id}>
                  <td>{m.email}</td>
                  <td>
                    <span className={`role-badge role-badge-${m.role}`}>
                      {ROLE_LABELS[m.role] || m.role}
                    </span>
                  </td>
                  <td className="table-actions">
                    <select value={m.role} onChange={(e) => handleRoleChange(m.id, e.target.value)}>
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button className="btn-link btn-danger" onClick={() => handleRemove(m.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default Members;
