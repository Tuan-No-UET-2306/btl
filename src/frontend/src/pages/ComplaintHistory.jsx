import { useCallback, useEffect, useState } from "react";
import { trafficApi } from "../api/trafficClient";
import { FileText, AlertCircle } from "lucide-react";

const statusStyle = (status) => {
  switch (status) {
    case "pending":
      return { bg: "rgba(255,210,139,0.12)", color: "#ffd28b", label: "🟡 Pending Review" };
    case "approved":
      return { bg: "rgba(46,213,115,0.12)", color: "#2ed573", label: "🟢 Approved (Points Restored)" };
    case "rejected":
      return { bg: "rgba(255,107,107,0.12)", color: "#ff6b6b", label: "🔴 Rejected (Points Deducted)" };
    default:
      return { bg: "rgba(255,255,255,0.08)", color: "var(--muted)", label: status };
  }
};

export default function ComplaintHistory() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await trafficApi.listComplaints();
      setComplaints(data || []);
    } catch (err) {
      setError(err.message || "Failed to load complaints.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  return (
    <section className="panel">
      <div className="panel-head">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FileText size={14} /> Complaint History
        </span>
        <span className="subtle">Tracking driver complaints against violations</span>
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
      ) : complaints.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={32} />
          </div>
          <span>No complaints filed yet.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Complaint ID</th>
                <th>Target Plate</th>
                <th>Applied Violation</th>
                <th>Date Filed</th>
                <th>Current Status</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => {
                const st = statusStyle(c.status);
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.case_id}</strong>
                    </td>
                    <td>{c.plate_number || c.license_plate || "-"}</td>
                    <td>
                      {c.violation_type || "-"}
                      {c.points_deducted > 0 && (
                        <span style={{ color: "#ff6b6b", fontWeight: 600 }}>
                          {" "}(+{c.points_deducted} Points)
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {c.created_at
                        ? new Date(c.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          background: st.bg,
                          color: st.color,
                          border: `1px solid ${st.bg.replace("0.12", "0.3")}`,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}