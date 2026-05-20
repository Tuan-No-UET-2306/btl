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
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={16} /> Create User
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
              {users.map((user) => (
                <tr key={user.id}>
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
                      }}
                      onClick={() => openEdit(user)}
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
                      onClick={() => handleDelete(user.id, user.username)}
                      disabled={user.username === "admin"}
                      title={
                        user.username === "admin"
                          ? "Cannot delete the default admin"
                          : "Delete this user"
                      }
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
        <div className="bl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="bl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bl-modal-head">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {editId ? <Pencil size={14} /> : <Plus size={14} />}
                {editId ? "Edit User" : "Create User"}
              </span>
              <button className="bl-modal-close" onClick={() => setShowModal(false)}>
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
                  style={{ background: "rgba(255,255,255,0.08)", color: "#eef3ff" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-cool"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  {editId ? <Pencil size={14} /> : <Plus size={14} />}
                  {editId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}