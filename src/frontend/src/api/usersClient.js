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

export const usersApi = {
  list: () =>
    request("/api/v1/users", {
      method: "GET",
      headers: { ...authHeaders() },
    }),
  create: (data) =>
    request("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    request(`/api/v1/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    request(`/api/v1/users/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    }),
};