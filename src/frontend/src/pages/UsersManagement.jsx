import { useCallback, useEffect, useState } from "react";
import { usersApi } from "../api/usersClient";
import { getCachedProfile } from "../utils/auth";
import { Users, Plus, Pencil, Trash2, AlertCircle, Shield } from "lucide-react";

export default function UsersManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("user");
  const [formError, setFormError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await usersApi.list();
      setUsers(data || []);
    } catch (err) {
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setEditId(null);
    setFormUsername("");
    setFormPassword("");
    setFormRole("user");
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditId(user.id);
    setFormUsername(user.username);
    setFormPassword("");
    setFormRole(user.role);
    setFormError("");
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    try {
      if (editId) {
        const payload = { username: formUsername, role: formRole };
        if (formPassword.trim()) payload.password = formPassword.trim();
        await usersApi.update(editId, payload);
      } else {
        await usersApi.create({
          username: formUsername,
          password: formPassword,
          role: formRole,
        });
      }
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.message || "Operation failed.");
    }
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await usersApi.delete(id);
      fetchUsers();
    } catch (err) {
      setError(err.message || "Delete failed.");
    }
  };

  const { role: currentRole } = getCachedProfile();

  return (
    <section className="panel">
      <div className="panel-head">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={14} /> User Management
        </span>
        <span className="subtle">Manage system users (admin only)</span>
      </div>

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
          <Plus size={16} /> Create User
        </button>
      </div>

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
      ) : users.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users size={32} />
          </div>
          <span>No users found.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Active</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => (
                <tr
                  key={user.id}
                  style={{
                    transition: "background 0.2s",
                    animation: `fadeInUp 0.25s ease ${idx * 0.04}s both`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{user.id}</td>
                  <td>
                    <strong>{user.username}</strong>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        user.role === "admin" ? "error" : "info"
                      }`}
                    >
                      {user.role === "admin" ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Shield size={12} /> {user.role}
                        </span>
                      ) : (
                        user.role
                      )}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${user.is_active ? "success" : "error"}`}
                    >
                      {user.is_active ? "Yes" : "No"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>
                    {user.created_at ? new Date(user.created_at).toLocaleString() : "-"}
                  </td>
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
                      onClick={() => openEdit(user)}
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
                      onClick={() => handleDelete(user.id, user.username)}
                      disabled={user.username === "admin"}
                      title={
                        user.username === "admin"
                          ? "Cannot delete the default admin"
                          : "Delete this user"
                      }
                      onMouseEnter={(e) => {
                        if (user.username !== "admin") {
                          e.currentTarget.style.background = "rgba(255,60,60,0.4)";
                          e.currentTarget.style.transform = "scale(1.02)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,60,60,0.2)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
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
                {editId ? "Edit User" : "Create User"}
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
                  <label>Username</label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    required
                    placeholder="e.g. operator1"
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
                  <label>Password {editId ? "(leave blank to keep current)" : ""}</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required={!editId}
                    placeholder={editId ? "Optional - new password" : "Password"}
                    style={{ transition: "border 0.2s, box-shadow 0.2s" }}
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
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
                  {editId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
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