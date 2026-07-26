import { useEffect, useState } from "react";
import api from "./api.js";

function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  function load() {
    return api.get("/categories").then((res) => setCategories(res.data));
  }

  useEffect(() => {
    load()
      .catch(() => setError("Failed to load categories"))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError("");
    try {
      await api.post("/categories", { name });
      setNewName("");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to add category");
    }
  }

  function startEdit(category) {
    setEditingId(category.id);
    setEditName(category.name);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(id) {
    const name = editName.trim();
    if (!name) return;
    setError("");
    try {
      await api.patch(`/categories/${id}`, { name });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to rename category");
    }
  }

  async function handleDelete(id) {
    if (
      !window.confirm(
        "Delete this category? Supplies using it will become uncategorized, not deleted."
      )
    )
      return;
    setError("");
    try {
      await api.delete(`/categories/${id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete category");
    }
  }

  if (loading) {
    return <div className="page-loading">Loading categories...</div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Categories</h1>

      {error && <div className="auth-error">{error}</div>}

      <section className="panel">
        {categories.length === 0 ? (
          <p className="empty-state">No categories yet.</p>
        ) : (
          <ul className="category-list">
            {categories.map((c) => (
              <li key={c.id}>
                {editingId === c.id ? (
                  <form
                    className="category-edit-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit(c.id);
                    }}
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="btn-link">
                      Save
                    </button>
                    <button type="button" className="btn-link" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="chip">{c.name}</span>
                    <span className="category-row-actions">
                      <button className="btn-link" onClick={() => startEdit(c)}>
                        Rename
                      </button>
                      <button
                        className="btn-link btn-danger"
                        onClick={() => handleDelete(c.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="add-category-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn-primary" type="submit">
            Add Category
          </button>
        </form>
      </section>
    </div>
  );
}

export default Categories;
