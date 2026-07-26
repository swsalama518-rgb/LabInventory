import { useEffect, useState, useCallback } from "react";
import api from "./api.js";

const SAMPLE_ITEMS = {
  reagents: [
    "Sodium Hydroxide",
    "Hydrochloric Acid",
    "Potassium Permanganate",
    "Phenolphthalein",
    "Silver Nitrate",
  ],
  consumables: [
    "Pipette Tips",
    "Nitrile Gloves",
    "Petri Dishes",
    "Parafilm",
    "Filter Paper",
  ],
  equipment: [
    "Bunsen Burner",
    "Centrifuge",
    "Microscope",
    "Analytical Balance",
    "Autoclave",
  ],
  chemicals: [
    "Ethanol",
    "Sodium Chloride",
    "Acetone",
    "Sulfuric Acid",
    "Methanol",
  ],
};

const EMPTY_FORM = {
  name: "",
  category_id: "",
  quantity: "",
  unit: "",
  location: "",
  expiration_date: "",
  min_quantity: "5",
  notes: "",
};

function Inventory() {
  const [categories, setCategories] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState("name");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const [lookupSupply, setLookupSupply] = useState(null);
  const [lookupData, setLookupData] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const [requestSupply, setRequestSupply] = useState(null);
  const [requestQuantity, setRequestQuantity] = useState("1");
  const [requestNotes, setRequestNotes] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const loadSupplies = useCallback(async () => {
    const params = { sort: sortBy };
    if (search) params.search = search;
    if (categoryFilter) params.category_id = categoryFilter;
    if (lowStockOnly) params.low_stock = "true";
    const res = await api.get("/supplies", { params });
    setSupplies(res.data);
  }, [search, categoryFilter, lowStockOnly, sortBy]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([api.get("/categories").then((res) => setCategories(res.data)), loadSupplies()])
      .catch(() => setError("Failed to load inventory data"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    loadSupplies().catch(() => setError("Failed to load supplies"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, lowStockOnly, sortBy]);

  function openAddForm() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(supply) {
    setEditingId(supply.id);
    setFormData({
      name: supply.name,
      category_id: supply.category_id || "",
      quantity: String(supply.quantity),
      unit: supply.unit || "",
      location: supply.location || "",
      expiration_date: supply.expiration_date || "",
      min_quantity: String(supply.min_quantity),
      notes: supply.notes || "",
    });
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!formData.name.trim()) {
      setFormError("Supply name is required");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      category_id: formData.category_id || null,
      quantity: formData.quantity === "" ? 0 : Number(formData.quantity),
      unit: formData.unit || null,
      location: formData.location || null,
      expiration_date: formData.expiration_date || null,
      min_quantity: formData.min_quantity === "" ? 5 : Number(formData.min_quantity),
      notes: formData.notes || null,
    };

    try {
      if (editingId) {
        await api.patch(`/supplies/${editingId}`, payload);
      } else {
        await api.post("/supplies", payload);
      }
      closeForm();
      await loadSupplies();
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to save supply");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this supply? This cannot be undone.")) return;
    try {
      await api.delete(`/supplies/${id}`);
      await loadSupplies();
    } catch {
      setError("Failed to delete supply");
    }
  }

  async function handleLookup(supply) {
    setLookupSupply(supply);
    setLookupData(null);
    setLookupError("");
    setLookupLoading(true);
    try {
      const res = await api.get(`/supplies/${supply.id}/lookup`);
      setLookupData(res.data);
    } catch (err) {
      setLookupError(err.response?.data?.error || "Lookup failed. Try again later.");
    } finally {
      setLookupLoading(false);
    }
  }

  function closeLookup() {
    setLookupSupply(null);
    setLookupData(null);
    setLookupError("");
  }

  function openRequestForm(supply) {
    setRequestSupply(supply);
    const shortfall = supply.min_quantity - supply.quantity;
    setRequestQuantity(String(shortfall > 0 ? shortfall : 1));
    setRequestNotes("");
    setRequestError("");
  }

  function closeRequestForm() {
    setRequestSupply(null);
    setRequestError("");
  }

  async function handleRequestSubmit(e) {
    e.preventDefault();
    setRequestError("");
    setRequestSubmitting(true);
    try {
      await api.post("/requests", {
        supply_id: requestSupply.id,
        quantity_requested: requestQuantity === "" ? 1 : Number(requestQuantity),
        notes: requestNotes || null,
      });
      closeRequestForm();
    } catch (err) {
      setRequestError(err.response?.data?.error || "Failed to submit request");
    } finally {
      setRequestSubmitting(false);
    }
  }

  if (loading) {
    return <div className="page-loading">Loading inventory...</div>;
  }

  const selectedCategory = categories.find((c) => String(c.id) === String(formData.category_id));
  const nameSuggestions = selectedCategory
    ? SAMPLE_ITEMS[selectedCategory.name.trim().toLowerCase()] || []
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        <button className="btn-primary" onClick={openAddForm}>
          + Add Supply
        </button>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <section className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Search supplies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label htmlFor="sortBy" className="sort-label">
          Sort by
        </label>
        <select id="sortBy" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Name</option>
          <option value="category">Category</option>
          <option value="quantity">Quantity</option>
        </select>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Low stock only
        </label>
      </section>

      <section className="supplies-table-wrap">
        {supplies.length === 0 ? (
          <p className="empty-state">No supplies found. Add your first one above.</p>
        ) : (
          <table className="supplies-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Location</th>
                <th>Expiration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {supplies.map((s) => (
                <tr key={s.id} className={s.is_low_stock ? "row-low-stock" : ""}>
                  <td>{s.name}</td>
                  <td>{s.category_name || "—"}</td>
                  <td>
                    {s.quantity} {s.unit || ""}
                    {s.is_low_stock && <span className="badge-low">Low</span>}
                  </td>
                  <td>{s.location || "—"}</td>
                  <td>{s.expiration_date || "—"}</td>
                  <td className="table-actions">
                    <button className="btn-link" onClick={() => openRequestForm(s)}>
                      Request
                    </button>
                    <button className="btn-link" onClick={() => handleLookup(s)}>
                      Look up
                    </button>
                    <button className="btn-link" onClick={() => openEditForm(s)}>
                      Edit
                    </button>
                    <button className="btn-link btn-danger" onClick={() => handleDelete(s.id)}>
                      Delete
                    </button>
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
            <h2>{editingId ? "Edit Supply" : "Add Supply"}</h2>
            {formError && <div className="auth-error">{formError}</div>}

            <label htmlFor="category_id">Category</label>
            <select
              id="category_id"
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              list="name-suggestions"
              placeholder={nameSuggestions.length ? "Type or pick a suggestion below" : ""}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <datalist id="name-suggestions">
              {nameSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>

            <div className="form-row">
              <div>
                <label htmlFor="quantity">Quantity</label>
                <input
                  id="quantity"
                  type="number"
                  step="any"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="unit">Unit</label>
                <input
                  id="unit"
                  type="text"
                  placeholder="mL, g, boxes..."
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="min_quantity">Low stock at</label>
                <input
                  id="min_quantity"
                  type="number"
                  step="any"
                  value={formData.min_quantity}
                  onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                />
              </div>
            </div>

            <label htmlFor="location">Location</label>
            <input
              id="location"
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />

            <label htmlFor="expiration_date">Expiration Date</label>
            <input
              id="expiration_date"
              type="date"
              value={formData.expiration_date}
              onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
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
                {editingId ? "Save Changes" : "Add Supply"}
              </button>
            </div>
          </form>
        </div>
      )}

      {lookupSupply && (
        <div className="modal-overlay" onClick={closeLookup}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>PubChem: {lookupSupply.name}</h2>

            {lookupLoading && <p className="empty-state">Looking up "{lookupSupply.name}"...</p>}

            {!lookupLoading && lookupError && (
              <div className="auth-error">{lookupError}</div>
            )}

            {!lookupLoading && lookupData && (
              <dl className="lookup-facts">
                <dt>Molecular formula</dt>
                <dd>{lookupData.molecular_formula || "—"}</dd>
                <dt>Molecular weight</dt>
                <dd>{lookupData.molecular_weight ? `${lookupData.molecular_weight} g/mol` : "—"}</dd>
                <dt>IUPAC name</dt>
                <dd>{lookupData.iupac_name || "—"}</dd>
                <dt>CAS number</dt>
                <dd>{lookupData.cas_number || "—"}</dd>
                <dt>PubChem CID</dt>
                <dd>
                  <a href={lookupData.pubchem_url} target="_blank" rel="noreferrer">
                    {lookupData.cid}
                  </a>
                </dd>
              </dl>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeLookup}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {requestSupply && (
        <div className="modal-overlay" onClick={closeRequestForm}>
          <form
            className="modal-card"
            onSubmit={handleRequestSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Request Restock: {requestSupply.name}</h2>
            {requestError && <div className="auth-error">{requestError}</div>}
            <p className="field-hint">
              This sends a restock request to your lab admin for approval — it
              doesn't change the current quantity.
            </p>

            <label htmlFor="requestQuantity">Quantity needed</label>
            <input
              id="requestQuantity"
              type="number"
              step="any"
              value={requestQuantity}
              onChange={(e) => setRequestQuantity(e.target.value)}
            />

            <label htmlFor="requestNotes">Notes</label>
            <textarea
              id="requestNotes"
              rows={2}
              placeholder="Optional — e.g. needed by Friday"
              value={requestNotes}
              onChange={(e) => setRequestNotes(e.target.value)}
            />

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeRequestForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={requestSubmitting}>
                {requestSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Inventory;
