import { useCallback, useEffect, useState } from "react";
import { blacklistApi } from "../api/client";
import { getCachedProfile } from "../utils/auth";
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

  const { role } = getCachedProfile();
  const isAdmin = role === "admin";

  return (
    <section className="panel" style={{ transition: "all 0.2s" }}>
      <div className="panel-head">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Ban size={14} /> Blacklist Management
        </span>
        <span className="subtle">Manage blacklisted license plates</span>
      </div>

      {isAdmin && (
        <div style={{ padding: "0 0 16px 0" }}>
          <button
            className="btn btn-cool"
            onClick={openCreate}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "";
            }}
          >
            <Plus size={16} /> Add to Blacklist
          </button>
        </div>
      )}
      {!isAdmin && (
        <div
          style={{
            padding: "0 0 12px 0",
            fontSize: 12,
            color: "var(--muted)",
            animation: "fadeIn 0.2s",
          }}
        >
          Viewing blacklist — only admins can add or remove entries.
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", gap: 12, padding: 12 }}>
          <div className="skeleton" style={{ height: 40, animation: "pulse 1.2s infinite" }} />
          <div className="skeleton" style={{ height: 40, animation: "pulse 1.2s infinite 0.1s" }} />
          <div className="skeleton" style={{ height: 40, animation: "pulse 1.2s infinite 0.2s" }} />
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
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    transition: "background 0.2s",
                    animation: `fadeInUp 0.25s ease ${idx * 0.05}s both`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td>
                    <strong>{item.plate_number}</strong>
                  </td>
                  <td>{item.reason || "-"}</td>
                  <td>{item.created_by || "-"}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  {isAdmin && (
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
                          transition: "all 0.2s",
                        }}
                        onClick={() => openEdit(item)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                          e.currentTarget.style.transform = "scale(1.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
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
                          transition: "all 0.2s",
                        }}
                        onClick={() => handleDelete(item.id)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,60,60,0.4)";
                          e.currentTarget.style.transform = "scale(1.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,60,60,0.2)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="bl-modal-overlay"
          onClick={() => setShowModal(false)}
          style={{
            animation: "fadeIn 0.2s ease",
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            className="bl-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: "scaleIn 0.2s cubic-bezier(0.2, 0.9, 0.4, 1.1)",
            }}
          >
            <div className="bl-modal-head">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {editId ? <Pencil size={14} /> : <Plus size={14} />}
                {editId ? "Edit Blacklist Entry" : "Add to Blacklist"}
              </span>
              <button
                className="bl-modal-close"
                onClick={() => setShowModal(false)}
                style={{ transition: "transform 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="bl-modal-body">
                {formError && (
                  <div
                    className="form-error"
                    style={{ color: "#ff6b6b", marginBottom: 12, fontSize: 13 }}
                  >
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
                    style={{ transition: "border 0.2s, box-shadow 0.2s" }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#2ad1ff";
                      e.target.style.boxShadow = "0 0 0 2px rgba(42,209,255,0.2)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "";
                      e.target.style.boxShadow = "";
                    }}
                  />
                </div>
                <div className="form-group">
                  <label>Reason (optional)</label>
                  <textarea
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Why is this plate blacklisted?"
                    rows={3}
                    style={{ transition: "border 0.2s" }}
                  />
                </div>
              </div>
              <div className="bl-modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowModal(false)}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#eef3ff",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-cool"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {editId ? <Pencil size={14} /> : <Plus size={14} />}
                  {editId ? "Update" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </section>
  );
}