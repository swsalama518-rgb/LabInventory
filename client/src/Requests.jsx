import { useEffect, useState } from "react";
import api from "./api.js";

const EMPTY_FORM = {
  supply_id: "",
  item_name: "",
  quantity_requested: "1",
  notes: "",
};

function Requests({ user }) {
  const [requests, setRequests] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const isAdmin = user?.role === "admin";

  function load() {
    return Promise.all([
      api.get("/requests").then((res) => setRequests(res.data)),
      api.get("/supplies").then((res) => setSupplies(res.data)),
    ]);
  }

  useEffect(() => {
    load()
      .catch(() => setError("Failed to load requests"))
      .finally(() => setLoading(false));
  }, []);

  function openForm() {
    setFormData(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setFormError("");
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!formData.supply_id && !formData.item_name.trim()) {
      setFormError("Pick an existing supply or type an item name");
      return;
    }

    const payload = {
      supply_id: formData.supply_id || null,
      item_name: formData.item_name.trim() || undefined,
      quantity_requested: formData.quantity_requested === "" ? 1 : Number(formData.quantity_requested),
      notes: formData.notes || null,
    };

    try {
      await api.post("/requests", payload);
      closeForm();
      await load();
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to submit request");
    }
  }

  async function handleReview(id, status) {
    setError("");
    try {
      await api.patch(`/requests/${id}`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update request");
    }
  }

  async function handleCancel(id) {
    if (!window.confirm("Cancel this request?")) return;
    setError("");
    try {
      await api.delete(`/requests/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to cancel request");
    }
  }

  if (loading) {
    return <div className="page-loading">Loading requests...</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Restock Requests</h1>
        <button className="btn-primary" onClick={openForm}>
          + New Request
        </button>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <section className="supplies-table-wrap">
        {requests.length === 0 ? (
          <p className="empty-state">No requests yet.</p>
        ) : (
          <table className="supplies-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Requested by</th>
                <th>Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.item_name}</td>
                  <td>{r.quantity_requested}</td>
                  <td>{r.requested_by_email}</td>
                  <td>
                    <span className={`status-badge status-badge-${r.status}`}>{r.status}</span>
                  </td>
                  <td>{r.notes || "—"}</td>
                  <td className="table-actions">
                    {r.status === "pending" && isAdmin && (
                      <>
                        <button className="btn-link" onClick={() => handleReview(r.id, "approved")}>
                          Approve
                        </button>
                        <button
                          className="btn-link btn-danger"
                          onClick={() => handleReview(r.id, "rejected")}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {r.status === "pending" && (
                      <button className="btn-link" onClick={() => handleCancel(r.id)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <form
            className="modal-card"
            onSubmit={handleFormSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>New Restock Request</h2>
            {formError && <div className="auth-error">{formError}</div>}

            <label htmlFor="supply_id">Existing supply</label>
            <select
              id="supply_id"
              value={formData.supply_id}
              onChange={(e) => setFormData({ ...formData, supply_id: e.target.value })}
            >
              <option value="">— Not tracked yet / type below —</option>
              {supplies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.quantity} {s.unit || ""} on hand)
                </option>
              ))}
            </select>

            <label htmlFor="item_name">Item name</label>
            <input
              id="item_name"
              type="text"
              placeholder="Only needed if not selecting a supply above"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
            />

            <label htmlFor="quantity_requested">Quantity needed</label>
            <input
              id="quantity_requested"
              type="number"
              step="any"
              value={formData.quantity_requested}
              onChange={(e) => setFormData({ ...formData, quantity_requested: e.target.value })}
            />

            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Requests;
