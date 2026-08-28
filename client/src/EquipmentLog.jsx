import { useEffect, useState } from "react";
import api from "./api.js";
import Icon from "./Icon.jsx";

const TYPE_OPTIONS = [
  "Incubator",
  "Fridge",
  "Freezer",
  "-80 Freezer",
  "Liquid Nitrogen Dewar",
  "Other",
];

const TYPE_ICONS = {
  Incubator: "incubator",
  Fridge: "fridge",
  Freezer: "freezer",
  "-80 Freezer": "freezer",
  "Liquid Nitrogen Dewar": "dewar",
};

function typeIcon(equipmentType) {
  return TYPE_ICONS[equipmentType] || "box";
}

const TYPE_COLORS = {
  Incubator: "var(--amber)",
  Fridge: "var(--blue)",
  Freezer: "var(--teal)",
  "-80 Freezer": "var(--teal)",
  "Liquid Nitrogen Dewar": "var(--purple)",
};

function typeColor(equipmentType) {
  return TYPE_COLORS[equipmentType] || "var(--accent)";
}

function toDatetimeLocal(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const EMPTY_LOG_FORM = {
  started_at: toDatetimeLocal(),
  sample_name: "",
  sample_count: "1",
  researcher_name: "",
  duration_hours: "",
  notes: "",
};

const EMPTY_EQUIPMENT_FORM = { name: "", equipment_type: TYPE_OPTIONS[0] };

function EquipmentLog() {
  const [equipment, setEquipment] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState("");

  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [equipmentForm, setEquipmentForm] = useState(EMPTY_EQUIPMENT_FORM);
  const [renaming, setRenaming] = useState(false);
  const [renameForm, setRenameForm] = useState(EMPTY_EQUIPMENT_FORM);

  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState(EMPTY_LOG_FORM);
  const [logFormError, setLogFormError] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  function loadEquipment() {
    return api.get("/equipment").then((res) => {
      setEquipment(res.data);
      if (!activeId && res.data.length > 0) {
        setActiveId(res.data[0].id);
      }
    });
  }

  function loadLogs(equipmentId) {
    if (!equipmentId) {
      setLogs([]);
      return Promise.resolve();
    }
    setLogsLoading(true);
    return api
      .get("/incubations", { params: { equipment_id: equipmentId } })
      .then((res) => setLogs(res.data))
      .finally(() => setLogsLoading(false));
  }

  useEffect(() => {
    loadEquipment()
      .catch(() => setError("Failed to load equipment"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeId) {
      loadLogs(activeId).catch(() => setError("Failed to load equipment log"));
      setShowCompleted(false);
    }
  }, [activeId]);

  const activeEquipment = equipment.find((e) => e.id === activeId);

  async function handleAddEquipment(e) {
    e.preventDefault();
    const name = equipmentForm.name.trim();
    if (!name) return;
    setError("");
    try {
      const res = await api.post("/equipment", {
        name,
        equipment_type: equipmentForm.equipment_type,
      });
      setEquipmentForm(EMPTY_EQUIPMENT_FORM);
      setShowAddEquipment(false);
      await loadEquipment();
      setActiveId(res.data.id);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to add equipment");
    }
  }

  function startRename() {
    setRenameForm({ name: activeEquipment.name, equipment_type: activeEquipment.equipment_type });
    setRenaming(true);
  }

  async function handleRename(e) {
    e.preventDefault();
    const name = renameForm.name.trim();
    if (!name) return;
    setError("");
    try {
      await api.patch(`/equipment/${activeId}`, {
        name,
        equipment_type: renameForm.equipment_type,
      });
      setRenaming(false);
      await loadEquipment();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update equipment");
    }
  }

  async function handleDeleteEquipment() {
    if (!window.confirm(`Delete ${activeEquipment.name}?`)) return;
    setError("");
    try {
      await api.delete(`/equipment/${activeId}`);
      setActiveId(null);
      await loadEquipment();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete equipment");
    }
  }

  function openLogForm() {
    setLogForm({ ...EMPTY_LOG_FORM, started_at: toDatetimeLocal() });
    setLogFormError("");
    setShowLogForm(true);
  }

  async function handleLogSubmit(e) {
    e.preventDefault();
    setLogFormError("");

    if (!logForm.sample_name.trim()) {
      setLogFormError("Sample name is required");
      return;
    }
    if (!logForm.duration_hours || Number(logForm.duration_hours) <= 0) {
      setLogFormError("Enter how many hours the incubation runs for");
      return;
    }

    try {
      await api.post("/incubations", {
        equipment_id: activeId,
        sample_name: logForm.sample_name.trim(),
        sample_count: Number(logForm.sample_count) || 1,
        researcher_name: logForm.researcher_name.trim() || null,
        started_at: new Date(logForm.started_at).toISOString(),
        duration_hours: Number(logForm.duration_hours),
        notes: logForm.notes || null,
      });
      setShowLogForm(false);
      await loadLogs(activeId);
    } catch (err) {
      setLogFormError(err.response?.data?.error || "Failed to log entry");
    }
  }

  async function handlePickedUp(id) {
    setError("");
    try {
      await api.patch(`/incubations/${id}`, { picked_up: true });
      await loadLogs(activeId);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update log");
    }
  }

  async function handleDeleteLog(id) {
    if (!window.confirm("Delete this log entry?")) return;
    setError("");
    try {
      await api.delete(`/incubations/${id}`);
      await loadLogs(activeId);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete log entry");
    }
  }

  if (loading) {
    return <div className="page-loading">Loading equipment...</div>;
  }

  const active = logs.filter((l) => !l.picked_up_at);
  const completed = logs.filter((l) => l.picked_up_at);

  return (
    <div className="page">
      <h1 className="page-title">Equipment</h1>

      {error && <div className="auth-error">{error}</div>}

      <div className="equipment-tabs">
        {equipment.map((eq) => (
          <button
            key={eq.id}
            className={eq.id === activeId ? "equipment-tab equipment-tab-active" : "equipment-tab"}
            onClick={() => setActiveId(eq.id)}
            type="button"
            style={
              eq.id === activeId
                ? { background: typeColor(eq.equipment_type), borderColor: typeColor(eq.equipment_type) }
                : { borderColor: typeColor(eq.equipment_type) }
            }
          >
            <Icon
              name={typeIcon(eq.equipment_type)}
              style={{ color: eq.id === activeId ? "#fff" : typeColor(eq.equipment_type) }}
            />
            {eq.name}
          </button>
        ))}
        <button
          className="equipment-tab equipment-tab-add"
          type="button"
          onClick={() => setShowAddEquipment(true)}
        >
          + Add Equipment
        </button>
      </div>

      {showAddEquipment && (
        <section className="panel">
          <form className="add-category-form" onSubmit={handleAddEquipment}>
            <input
              type="text"
              placeholder="e.g. Incubator 4"
              value={equipmentForm.name}
              onChange={(e) => setEquipmentForm({ ...equipmentForm, name: e.target.value })}
              autoFocus
            />
            <select
              value={equipmentForm.equipment_type}
              onChange={(e) =>
                setEquipmentForm({ ...equipmentForm, equipment_type: e.target.value })
              }
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button className="btn-primary" type="submit">
              Add
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setShowAddEquipment(false)}
            >
              Cancel
            </button>
          </form>
        </section>
      )}

      {!activeEquipment ? (
        <p className="empty-state">
          No equipment yet. Click "+ Add Equipment" above to add your first one.
        </p>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              {renaming ? (
                <form className="add-category-form" onSubmit={handleRename}>
                  <input
                    type="text"
                    value={renameForm.name}
                    onChange={(e) => setRenameForm({ ...renameForm, name: e.target.value })}
                    autoFocus
                  />
                  <select
                    value={renameForm.equipment_type}
                    onChange={(e) =>
                      setRenameForm({ ...renameForm, equipment_type: e.target.value })
                    }
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button className="btn-link" type="submit">
                    Save
                  </button>
                  <button className="btn-link" type="button" onClick={() => setRenaming(false)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h2>
                    <Icon
                      name={typeIcon(activeEquipment.equipment_type)}
                      style={{ color: typeColor(activeEquipment.equipment_type) }}
                    />{" "}
                    {activeEquipment.name}{" "}
                    <span className="list-meta">({activeEquipment.equipment_type})</span>
                  </h2>
                  <span className="table-actions">
                    <button className="btn-link" onClick={startRename}>
                      Rename
                    </button>
                    <button className="btn-link btn-danger" onClick={handleDeleteEquipment}>
                      Delete
                    </button>
                    <button className="btn-primary" onClick={openLogForm}>
                      + Log Samples
                    </button>
                  </span>
                </>
              )}
            </div>
          </section>

          {logsLoading ? (
            <div className="page-loading">Loading log...</div>
          ) : (
            <>
              <section className="supplies-table-wrap">
                {active.length === 0 ? (
                  <p className="empty-state">Nothing currently in {activeEquipment.name}.</p>
                ) : (
                  <table className="supplies-table">
                    <thead>
                      <tr>
                        <th>Sample</th>
                        <th>Qty</th>
                        <th>Researcher</th>
                        <th>Put in</th>
                        <th>Take out</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((log) => (
                        <tr key={log.id}>
                          <td>{log.sample_name}</td>
                          <td className="mono">{log.sample_count}</td>
                          <td>{log.researcher_name || "—"}</td>
                          <td className="mono">{new Date(log.started_at).toLocaleString()}</td>
                          <td className="mono">
                            {new Date(log.ends_at).toLocaleString()}
                            {log.is_overdue && (
                              <span className="status-badge status-badge-rejected">ready</span>
                            )}
                          </td>
                          <td>{log.notes || "—"}</td>
                          <td className="table-actions">
                            <button className="btn-link" onClick={() => handlePickedUp(log.id)}>
                              Picked Up
                            </button>
                            <button
                              className="btn-link btn-danger"
                              onClick={() => handleDeleteLog(log.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="panel">
                <div className="panel-header">
                  <h2>Completed</h2>
                  <button className="btn-link" onClick={() => setShowCompleted(!showCompleted)}>
                    {showCompleted ? "Hide" : `Show (${completed.length})`}
                  </button>
                </div>
                {showCompleted &&
                  (completed.length === 0 ? (
                    <p className="empty-state">No completed logs yet for {activeEquipment.name}.</p>
                  ) : (
                    <table className="supplies-table">
                      <thead>
                        <tr>
                          <th>Sample</th>
                          <th>Qty</th>
                          <th>Researcher</th>
                          <th>Picked up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completed.map((log) => (
                          <tr key={log.id}>
                            <td>{log.sample_name}</td>
                            <td className="mono">{log.sample_count}</td>
                            <td>{log.researcher_name || "—"}</td>
                            <td className="mono">{new Date(log.picked_up_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
              </section>
            </>
          )}
        </>
      )}

      {showLogForm && (
        <div className="modal-overlay" onClick={() => setShowLogForm(false)}>
          <form
            className="modal-card"
            onSubmit={handleLogSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Log Samples: {activeEquipment.name}</h2>
            {logFormError && <div className="auth-error">{logFormError}</div>}

            <label htmlFor="started_at">Date/time put in</label>
            <input
              id="started_at"
              type="datetime-local"
              value={logForm.started_at}
              onChange={(e) => setLogForm({ ...logForm, started_at: e.target.value })}
            />

            <label htmlFor="sample_name">Sample</label>
            <input
              id="sample_name"
              type="text"
              value={logForm.sample_name}
              onChange={(e) => setLogForm({ ...logForm, sample_name: e.target.value })}
            />

            <label htmlFor="sample_count">Number of samples</label>
            <input
              id="sample_count"
              type="number"
              min="1"
              step="1"
              value={logForm.sample_count}
              onChange={(e) => setLogForm({ ...logForm, sample_count: e.target.value })}
            />

            <label htmlFor="researcher_name">Researcher</label>
            <input
              id="researcher_name"
              type="text"
              placeholder="Who the samples belong to"
              value={logForm.researcher_name}
              onChange={(e) => setLogForm({ ...logForm, researcher_name: e.target.value })}
            />

            <label htmlFor="duration_hours">Incubation time (hours)</label>
            <input
              id="duration_hours"
              type="number"
              step="any"
              min="0"
              value={logForm.duration_hours}
              onChange={(e) => setLogForm({ ...logForm, duration_hours: e.target.value })}
            />

            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              rows={2}
              value={logForm.notes}
              onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
            />

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowLogForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default EquipmentLog;
