import { getToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    try {
      const payload = await response.json();
      throw new Error(payload?.message || payload?.detail || `Request failed (${response.status})`);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      throw err;
    }
  }
  if (response.status === 204) return null;
  return response.json();
};

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const adminApi = {
  // Complaint management
  listComplaints: () =>
    request("/api/v1/traffic/complaints", {
      method: "GET",
      headers: { ...authHeaders() },
    }),
  updateComplaintStatus: (complaintId, status) =>
    request(`/api/v1/traffic/complaints/${complaintId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    }),

  // Violation management
  listViolations: (plateNumber) => {
    let path = "/api/v1/traffic/violations";
    if (plateNumber) path += `?plate=${encodeURIComponent(plateNumber)}`;
    return request(path, {
      method: "GET",
      headers: { ...authHeaders() },
    });
  },
  updateViolation: (violationId, data) =>
    request(`/api/v1/traffic/violations/${violationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }),
  createViolation: (data) =>
    request("/api/v1/traffic/violations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }),

  // Detection events (live operations)
  listDetections: () =>
    request("/api/v1/traffic/lookup/recent", {
      method: "GET",
      headers: { ...authHeaders() },
    }),
};