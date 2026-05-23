import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../api/adminClient";
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Gauge,
  DollarSign,
  FileText,
  RefreshCw,
} from "lucide-react";

export default function AdminOperations() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [message, setMessage] = useState("");

  // Edit violation modal
  const [editViolation, setEditViolation] = useState(null);
  const [editForm, setEditForm] = useState({
    points_deducted: 0,
    fine_amount: "",
    violation_type: "",
    status: "",
  });
  const [editLoading, setEditLoading] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminApi.listComplaints();
      setComplaints(data || []);
    } catch (err) {
      setError(err.message || "Failed to load operations data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Approve / Reject complaint
  const handleComplaintAction = async (complaintId, status) => {
    setProcessingId(complaintId);
    setMessage("");
    try {
      const result = await adminApi.updateComplaintStatus(complaintId, status);
      setMessage(`✅ ${result.message}`);
      fetchData();
    } catch (err) {
      setMessage(`❌ ${err.message || "Action failed."}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Open edit violation modal
  const openEditViolation = (item) => {
    setEditViolation(item);
    setEditForm({
      points_deducted: item.points_deducted || 0,
      fine_amount: item.fine_amount || "",
      violation_type: item.violation_type || "",
      status: item.status || "pending",
    });
  };

  // Submit violation edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editViolation?.violation_id) return;
    setEditLoading(true);
    try {
      const payload = {};
      if (editForm.points_deducted) payload.points_deducted = parseInt(editForm.points_deducted);
      if (editForm.fine_amount) payload.fine_amount = parseFloat(editForm.fine_amount);
      if (editForm.violation_type) payload.violation_type = editForm.violation_type;
      if (editForm.status) payload.status = editForm.status;

      await adminApi.updateViolation(editViolation.violation_id, payload);
      setMessage("✅ Violation updated successfully!");
      setEditViolation(null);
      fetchData();
    } catch (err) {
      setMessage(`❌ ${err.message || "Update failed."}`);
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Shield size={14} /> Admin Operations
        </span>
        <span className="subtle">Manage complaints and violations</span>
      </div>

      {/* Message Toast */}
      {message && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            marginBottom: 12,
            background: message.includes("✅")
              ? "rgba(46,213,115,0.12)"
              : "rgba(255,107,107,0.12)",
            border: `1px solid ${
              message.includes("✅")
                ? "rgba(46,213,115,0.3)"
                : "rgba(255,107,107,0.3)"
            }`,
            color: message.includes("✅") ? "#2ed573" : "#ff6b6b",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backdropFilter: "blur(4px)",
            animation: "slideInDown 0.2s ease",
          }}
        >
          <span>{message}</span>
          <button
            onClick={() => setMessage("")}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, transition: "transform 0.1s" }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            &times;
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="skeleton" style={{ height: 40, animation: "pulse 1.2s infinite" }} />
          <div className="skeleton" style={{ height: 40, animation: "pulse 1.2s infinite 0.1s" }} />
          <div className="skeleton" style={{ height: 60, animation: "pulse 1.2s infinite 0.2s" }} />
          <div className="skeleton" style={{ height: 60, animation: "pulse 1.2s infinite 0.3s" }} />
        </div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} />
          <span>{error}</span>
        </div>
      ) : complaints.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={32} />
          </div>
          <span>No pending complaints or violations.</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Live detection events will appear here once violations are recorded.
          </span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Plate</th>
                <th>Violation</th>
                <th>Points / Fine</th>
                <th>Filed By</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    transition: "background 0.2s, transform 0.1s",
                    animation: `fadeInUp 0.25s ease ${idx * 0.03}s both`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td>
                    <strong style={{ fontSize: 12 }}>{item.case_id}</strong>
                  </td>
                  <td>{item.plate_number || item.license_plate || "-"}</td>
                  <td>
                    {item.violation_type || "-"}
                    <br />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      {item.points_deducted > 0 && (
                        <span style={{ color: "#ff6b6b" }}>
                          -{item.points_deducted} pts
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="status-badge info" style={{ fontSize: 10 }}>
                        <Gauge size={10} /> {item.points_deducted || 0}
                      </span>
                      {item.fine_amount_str && (
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                          {item.fine_amount_str}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>{item.full_name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>
                      {item.citizen_id || "-"}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <div>{item.reason || "-"}</div>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        item.status === "pending"
                          ? "warning"
                          : item.status === "approved"
                          ? "success"
                          : "error"
                      }`}
                      style={{ fontSize: 10 }}
                    >
                      {item.status === "pending"
                        ? "🟡 Pending"
                        : item.status === "approved"
                        ? "🟢 Approved"
                        : "🔴 Rejected"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexDirection: "column" }}>
                      {item.status === "pending" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="btn btn-sm"
                            disabled={processingId === item.id}
                            onClick={() => handleComplaintAction(item.id, "approved")}
                            style={{
                              background: "rgba(46,213,115,0.15)",
                              color: "#2ed573",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              padding: "4px 8px",
                              fontSize: 10,
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(46,213,115,0.3)";
                              e.currentTarget.style.transform = "scale(1.02)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(46,213,115,0.15)";
                              e.currentTarget.style.transform = "scale(1)";
                            }}
                          >
                            {processingId === item.id ? "..." : <CheckCircle size={10} />}
                            Approve
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={processingId === item.id}
                            onClick={() => handleComplaintAction(item.id, "rejected")}
                            style={{
                              background: "rgba(255,107,107,0.15)",
                              color: "#ff6b6b",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              padding: "4px 8px",
                              fontSize: 10,
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(255,107,107,0.3)";
                              e.currentTarget.style.transform = "scale(1.02)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(255,107,107,0.15)";
                              e.currentTarget.style.transform = "scale(1)";
                            }}
                          >
                            {processingId === item.id ? "..." : <XCircle size={10} />}
                            Reject
                          </button>
                        </div>
                      )}
                      <button
                        className="btn btn-sm"
                        onClick={() => openEditViolation(item)}
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          color: "#eef3ff",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          padding: "4px 8px",
                          fontSize: 10,
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                          e.currentTarget.style.transform = "scale(1.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        <Gauge size={10} /> Edit Violation
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Violation Modal */}
      {editViolation && (
        <div
          className="bl-modal-overlay"
          onClick={() => setEditViolation(null)}
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
              transition: "transform 0.2s",
            }}
          >
            <div className="bl-modal-head">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Gauge size={14} /> Edit Violation
              </span>
              <button
                className="bl-modal-close"
                onClick={() => setEditViolation(null)}
                style={{ transition: "transform 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="bl-modal-body">
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                  Editing violation for{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {editViolation.case_id}
                  </strong>{" "}
                  - {editViolation.violation_type}
                </div>
                <div className="form-group">
                  <label>Violation Type</label>
                  <input
                    type="text"
                    value={editForm.violation_type}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, violation_type: e.target.value }))
                    }
                    placeholder="e.g. Speeding"
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
                  <label>Points Deducted (2-10)</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={editForm.points_deducted}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, points_deducted: e.target.value }))
                    }
                    style={{ transition: "border 0.2s, box-shadow 0.2s" }}
                  />
                </div>
                <div className="form-group">
                  <label>Fine Amount (VND)</label>
                  <input
                    type="number"
                    value={editForm.fine_amount}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, fine_amount: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, status: e.target.value }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
              <div className="bl-modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEditViolation(null)}
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
                  disabled={editLoading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.2s",
                  }}
                >
                  <RefreshCw size={14} className={editLoading ? "spin-animation" : ""} /> {editLoading ? "Updating..." : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
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
        .spin-animation {
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}