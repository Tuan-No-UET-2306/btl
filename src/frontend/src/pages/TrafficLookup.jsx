import { useState } from "react";
import { trafficApi } from "../api/trafficClient";
import { getCachedProfile } from "../utils/auth";
import {
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Shield,
  AlertOctagon,
  FileText,
  Send,
  Car,
  User,
  CreditCard,
  Gauge,
  Ban,
  PlusCircle,
} from "lucide-react";

const MAX_POINTS = 12;

function CreateViolationSection({ onViolationCreated }) {
  const [violationForm, setViolationForm] = useState({
    license_plate: "",
    violation_type: "",
    points_deducted: 2,
    fine_amount: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field, value) => {
    setViolationForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        license_plate: violationForm.license_plate,
        violation_type: violationForm.violation_type,
        points_deducted: parseInt(violationForm.points_deducted, 10),
        fine_amount: violationForm.fine_amount
          ? parseFloat(violationForm.fine_amount)
          : null,
      };
      const data = await trafficApi.createViolation(payload);
      onViolationCreated(
        data.is_blacklisted
          ? `🔴 ${data.message}`
          : `✅ ${data.message}`
      );
      setViolationForm({
        license_plate: "",
        violation_type: "",
        points_deducted: 2,
        fine_amount: "",
      });
    } catch (err) {
      onViolationCreated(`❌ ${err.message || "Failed to create violation."}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 20,
        border: "1px solid rgba(255,59,48,0.3)",
        borderRadius: 12,
        padding: 16,
        background: "rgba(255,59,48,0.04)",
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#ff8a80",
        }}
      >
        <PlusCircle size={16} />
        Admin: Manual Violation Creation
      </div>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 160px", marginBottom: 0 }}>
            <label>License Plate *</label>
            <input
              type="text"
              value={violationForm.license_plate}
              onChange={(e) => handleChange("license_plate", e.target.value)}
              required
              placeholder="e.g. 30A-123.45"
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
          <div className="form-group" style={{ flex: "1 1 180px", marginBottom: 0 }}>
            <label>Violation Type *</label>
            <input
              type="text"
              value={violationForm.violation_type}
              onChange={(e) => handleChange("violation_type", e.target.value)}
              required
              placeholder="e.g. Speeding"
            />
          </div>
          <div className="form-group" style={{ flex: "0 1 100px", marginBottom: 0 }}>
            <label>Points (2-10)</label>
            <input
              type="number"
              min={2}
              max={10}
              value={violationForm.points_deducted}
              onChange={(e) => handleChange("points_deducted", e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: "0 1 140px", marginBottom: 0 }}>
            <label>Fine (VND)</label>
            <input
              type="number"
              value={violationForm.fine_amount}
              onChange={(e) => handleChange("fine_amount", e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div>
          <button
            type="submit"
            className="btn"
            disabled={submitting}
            style={{
              background: "rgba(255,59,48,0.2)",
              color: "#ff6b6b",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,59,48,0.4)";
              e.currentTarget.style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,59,48,0.2)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <PlusCircle size={14} />{" "}
            {submitting ? "Logging..." : "Log Violation"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TrafficLookup() {
  const [plateInput, setPlateInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Complaint modal
  const [showComplaint, setShowComplaint] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [complaintForm, setComplaintForm] = useState({
    full_name: "",
    citizen_id: "",
    phone_number: "",
    address: "",
    reason: "",
    evidence_url: "",
  });
  const [complaintResult, setComplaintResult] = useState("");
  const [complaintLoading, setComplaintLoading] = useState(false);

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!plateInput.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await trafficApi.lookup(plateInput.trim());
      setResult(data);
    } catch (err) {
      setError(err.message || "Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const openComplaint = (violation) => {
    setSelectedViolation(violation);
    setComplaintForm({
      full_name: result?.owner_name || "",
      citizen_id: result?.owner_citizen_id || "",
      phone_number: "",
      address: "",
      reason: "",
      evidence_url: "",
    });
    setComplaintResult("");
    setShowComplaint(true);
  };

  const handleComplaintSubmit = async (e) => {
    e.preventDefault();
    if (!selectedViolation) return;

    setComplaintLoading(true);
    setComplaintResult("");

    try {
      const data = await trafficApi.createComplaint({
        violation_id: selectedViolation.id,
        ...complaintForm,
      });
      setComplaintResult(
        `✅ Complaint successfully registered! Your Case ID is ${data.case_id}`
      );
      setShowComplaint(false);
    } catch (err) {
      setComplaintResult(`❌ ${err.message || "Complaint failed."}`);
    } finally {
      setComplaintLoading(false);
    }
  };

  const handleComplaintChange = (field, value) => {
    setComplaintForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <section className="panel" style={{ minHeight: "auto", transition: "all 0.2s" }}>
      {/* Header */}
      <div className="panel-head">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Shield size={14} /> Traffic Violation System
        </span>
        <span className="subtle">Check demerit points & file complaints</span>
      </div>

      {/* Search Form */}
      <form onSubmit={handleLookup} className="upload-form" style={{ marginBottom: 16 }}>
        <div className="upload-field" style={{ flex: "1 1 300px" }}>
          <input
            type="text"
            value={plateInput}
            onChange={(e) => setPlateInput(e.target.value)}
            placeholder="Enter license plate (e.g. 30A-123.45)"
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              color: "inherit",
              fontSize: 14,
              outline: "none",
              transition: "background 0.2s",
            }}
          />
        </div>
        <button
          className="btn btn-cool"
          type="submit"
          disabled={loading || !plateInput.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!loading && plateInput.trim()) {
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <Search size={16} /> {loading ? "Searching..." : "Lookup"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div
          className="lpr-result error"
          style={{ marginBottom: 12, animation: "shake 0.3s ease" }}
        >
          <div className="lpr-result-icon">
            <XCircle size={24} />
          </div>
          <div className="lpr-result-body">
            <div className="lpr-error-text">{error}</div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Blacklist Alert Banner */}
          {result.is_blacklisted ? (
            <div
              style={{
                border: "2px solid #ff3b30",
                borderRadius: 12,
                padding: 20,
                marginBottom: 16,
                background: "rgba(255,59,48,0.08)",
                display: "grid",
                gap: 12,
                animation: "pulseGlow 1.5s infinite",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#ff3b30",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                <AlertOctagon size={24} />
                ⚠️ CRITICAL SECURITY ALERT
              </div>
              <div style={{ fontSize: 14, color: "var(--text)" }}>
                Vehicle <strong>{result.plate_number}</strong> is flagged on the{" "}
                <strong>SYSTEM BLACKLIST</strong>.
              </div>
              <div
                style={{
                  background: "rgba(255,59,48,0.1)",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#ff8a80",
                }}
              >
                <strong>Reason:</strong>{" "}
                {result.blacklist_reason ||
                  "Criminal Investigation / Suspended"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Driving privileges are legally suspended. This incident has been
                logged.
              </div>
            </div>
          ) : (
            /* Normal Result */
            <div style={{ display: "grid", gap: 16, animation: "fadeInUp 0.3s ease" }}>
              {/* Vehicle Info */}
              <div
                style={{
                  border: "1px solid var(--stroke)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--stat-card-bg)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--accent-2)",
                  }}
                >
                  <Car size={20} /> {result.plate_number}
                </div>
                <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                  {result.vehicle_type && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ color: "var(--muted)", minWidth: 100 }}>
                        Vehicle Type:
                      </span>
                      <span>{result.vehicle_type}</span>
                    </div>
                  )}
                  {result.vehicle_brand && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ color: "var(--muted)", minWidth: 100 }}>
                        Brand:
                      </span>
                      <span>{result.vehicle_brand}</span>
                    </div>
                  )}
                  {result.vehicle_color && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ color: "var(--muted)", minWidth: 100 }}>
                        Color:
                      </span>
                      <span>{result.vehicle_color}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Owner Info */}
              {result.owner_name && (
                <div
                  style={{
                    border: "1px solid var(--stroke)",
                    borderRadius: 12,
                    padding: 16,
                    background: "var(--stat-card-bg)",
                    transition: "transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 12,
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    <User size={16} /> Owner Information
                  </div>
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ color: "var(--muted)", minWidth: 100 }}>
                        Name:
                      </span>
                      <span>{result.owner_name}</span>
                    </div>
                    {result.owner_citizen_id && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "var(--muted)", minWidth: 100 }}>
                          Citizen ID:
                        </span>
                        <span>{result.owner_citizen_id}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Points Status */}
              <div
                style={{
                  border: "1px solid var(--stroke)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--stat-card-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Gauge size={20} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    Driving Points
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {result.total_points_deducted > 0
                      ? `${result.total_points_deducted} deducted`
                      : "No deductions"}
                  </span>
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color:
                        result.points_remaining <= 3
                          ? "#ff3b30"
                          : result.points_remaining <= 6
                          ? "#ffd28b"
                          : "#2ed573",
                      transition: "color 0.2s",
                    }}
                  >
                    {result.points_remaining}/{MAX_POINTS}
                  </span>
                </div>
              </div>

              {/* Violations List */}
              {result.violations && result.violations.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AlertTriangle size={16} color="#ffd28b" />
                    Pending Violations ({result.violations.length})
                  </div>
                  {result.violations.map((v, idx) => (
                    <div
                      key={v.id}
                      style={{
                        border: "1px solid var(--stroke)",
                        borderRadius: 10,
                        padding: 14,
                        marginBottom: 8,
                        background: "var(--panel-bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        transition: "all 0.2s",
                        animation: `fadeInRight 0.25s ease ${idx * 0.05}s both`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                        e.currentTarget.style.transform = "translateX(4px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--panel-bg)";
                        e.currentTarget.style.transform = "translateX(0)";
                      }}
                    >
                      <div style={{ display: "grid", gap: 4, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--text)",
                          }}
                        >
                          {v.violation_type}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            display: "flex",
                            gap: 16,
                          }}
                        >
                          {v.fine_amount && (
                            <span>
                              Fine:{" "}
                              {v.fine_amount.toLocaleString("vi-VN", {
                                style: "currency",
                                currency: "VND",
                              })}
                            </span>
                          )}
                          <span>
                            Points: <strong style={{ color: "#ff6b6b" }}>-{v.points_deducted}</strong>
                          </span>
                          {v.issued_at && (
                            <span>
                              {new Date(v.issued_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn btn-sm"
                        style={{
                          background: "rgba(255,210,139,0.15)",
                          color: "#ffd28b",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          flexShrink: 0,
                          transition: "all 0.2s",
                        }}
                        onClick={() => openComplaint(v)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,210,139,0.3)";
                          e.currentTarget.style.transform = "scale(1.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(255,210,139,0.15)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        <FileText size={12} /> File Complaint
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* No Violations */}
              {(!result.violations || result.violations.length === 0) && (
                <div
                  className="lpr-result success"
                  style={{ marginTop: 8, animation: "fadeIn 0.3s ease" }}
                >
                  <div className="lpr-result-icon">
                    <CheckCircle size={24} />
                  </div>
                  <div className="lpr-result-body">
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      No pending violations found
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      Vehicle {result.plate_number} has a clean record.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Complaint Modal */}
      {showComplaint && selectedViolation && (
        <div
          className="bl-modal-overlay"
          onClick={() => setShowComplaint(false)}
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
                <FileText size={14} /> File a Complaint
              </span>
              <button
                className="bl-modal-close"
                onClick={() => setShowComplaint(false)}
                style={{ transition: "transform 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleComplaintSubmit}>
              <div className="bl-modal-body">
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    marginBottom: 12,
                    padding: 8,
                    border: "1px solid var(--stroke)",
                    borderRadius: 8,
                    background: "var(--panel-bg)",
                  }}
                >
                  Complaining against violation:{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {selectedViolation.violation_type}
                  </strong>{" "}
                  (-{selectedViolation.points_deducted} points)
                </div>

                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={complaintForm.full_name}
                    onChange={(e) =>
                      handleComplaintChange("full_name", e.target.value)
                    }
                    required
                    placeholder="Your full name"
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
                  <label>Citizen ID / CCCD *</label>
                  <input
                    type="text"
                    value={complaintForm.citizen_id}
                    onChange={(e) =>
                      handleComplaintChange("citizen_id", e.target.value)
                    }
                    required
                    placeholder="12-digit citizen ID"
                    maxLength={12}
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    value={complaintForm.phone_number}
                    onChange={(e) =>
                      handleComplaintChange("phone_number", e.target.value)
                    }
                    placeholder="Optional phone number"
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    value={complaintForm.address}
                    onChange={(e) =>
                      handleComplaintChange("address", e.target.value)
                    }
                    placeholder="Optional address"
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Reason for Complaint *</label>
                  <textarea
                    value={complaintForm.reason}
                    onChange={(e) =>
                      handleComplaintChange("reason", e.target.value)
                    }
                    required
                    placeholder="Explain why you are filing this complaint"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Evidence URL (optional)</label>
                  <input
                    type="url"
                    value={complaintForm.evidence_url}
                    onChange={(e) =>
                      handleComplaintChange("evidence_url", e.target.value)
                    }
                    placeholder="Link to image/document evidence"
                  />
                </div>
              </div>
              <div className="bl-modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowComplaint(false)}
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
                  disabled={complaintLoading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!complaintLoading) e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <Send size={14} />{" "}
                  {complaintLoading ? "Submitting..." : "Submit Complaint"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Section: Create Violation */}
      {getCachedProfile().role === "admin" && (
        <CreateViolationSection
          onViolationCreated={(msg) => setComplaintResult(msg)}
        />
      )}

      {/* Complaint Result Toast */}
      {complaintResult && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            padding: "14px 20px",
            borderRadius: 12,
            background: complaintResult.includes("✅")
              ? "rgba(46,213,115,0.15)"
              : "rgba(255,107,107,0.15)",
            border: `1px solid ${
              complaintResult.includes("✅")
                ? "rgba(46,213,115,0.4)"
                : "rgba(255,107,107,0.4)"
            }`,
            color: complaintResult.includes("✅") ? "#2ed573" : "#ff6b6b",
            fontSize: 13,
            fontWeight: 500,
            maxWidth: 400,
            zIndex: 2000,
            backdropFilter: "blur(8px)",
            animation: "rise 300ms ease",
          }}
        >
          {complaintResult}
          <button
            onClick={() => setComplaintResult("")}
            style={{
              marginLeft: 12,
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
              transition: "transform 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            &times;
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(255,59,48,0.4); }
          70% { box-shadow: 0 0 0 10px rgba(255,59,48,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,59,48,0); }
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}