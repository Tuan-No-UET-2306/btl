import { useCallback, useEffect, useState } from "react";
import { blacklistApi } from "../api/client";
import { Ban, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";

export default function Blacklist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formPlate, setFormPlate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formError, setFormError] = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await blacklistApi.list();
      setItems(data || []);
    } catch (err) {
      setError(err.message || "Failed to load blacklist.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setEditId(null);
    setFormPlate("");
    setFormReason("");
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditId(item.id);
    setFormPlate(item.plate_number);
    setFormReason(item.reason || "");
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    try {
      if (editId) {
        await blacklistApi.update(editId, { reason: formReason });
      } else {
        await blacklistApi.create({ plate_number: formPlate, reason: formReason });
      }
      setShowModal(false);
      fetchList();
    } catch (err) {
      setFormError(err.message || "Operation failed.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this plate from blacklist?")) return;
    try {
      await blacklistApi.delete(id);
      fetchList();
    } catch (err) {
      setError(err.message || "Delete failed.");
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Ban size={14} /> Blacklist Management
        </span>
        <span className="subtle">Manage blacklisted license plates</span>
      </div>

      <div style={{ padding: "0 0 16px 0" }}>
        <button className="btn btn-cool" onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} /> Add to Blacklist
        </button>
      </div>

      {loading ? (
        <div style={{ display: "grid", gap: 12, padding: 12 }}>
          <div className="skeleton" style={{ height: 40 }} />
          <div className="skeleton" style={{ height: 40 }} />
          <div className="skeleton" style={{ height: 40 }} />
        </div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} />
          <span>{error}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Ban size={32} />
          </div>
          <span>No blacklisted plates yet.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Plate Number</th>
                <th>Reason</th>
                <th>Added By</th>
                <th>Added At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.plate_number}</strong>
                  </td>
                  <td>{item.reason || "-"}</td>
                  <td>{item.created_by || "-"}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(item.created_at).toLocaleString()}</td>
                  <td>
                    <button
                      className="btn btn-sm"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        color: "#eef3ff",
                        marginRight: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{
                        background: "rgba(255,60,60,0.2)",
                        color: "#ff6b6b",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {editId ? <Pencil size={14} /> : <Plus size={14} />}
                {editId ? "Edit Blacklist Entry" : "Add to Blacklist"}
              </span>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {formError && (
                  <div className="form-error" style={{ color: "#ff6b6b", marginBottom: 12, fontSize: 13 }}>
                    {formError}
                  </div>
                )}
                <div className="form-group">
                  <label>Plate Number</label>
                  <input
                    type="text"
                    value={formPlate}
                    onChange={(e) => setFormPlate(e.target.value)}
                    disabled={!!editId}
                    required
                    placeholder="e.g. 29A-12345"
                  />
                </div>
                <div className="form-group">
                  <label>Reason (optional)</label>
                  <textarea
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Why is this plate blacklisted?"
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowModal(false)}
                  style={{ background: "rgba(255,255,255,0.08)", color: "#eef3ff" }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-cool" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {editId ? <Pencil size={14} /> : <Plus size={14} />}
                  {editId ? "Update" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}