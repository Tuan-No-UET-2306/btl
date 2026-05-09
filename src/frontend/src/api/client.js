import { getToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const message = payload?.detail || payload?.message || "Request failed.";
    throw new Error(message);
  }

  return payload;
};

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const authApi = {
  login: (data) =>
    request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  register: (data) =>
    request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  me: () =>
    request("/api/v1/auth/me", {
      headers: { ...authHeaders() },
    }),
};

export const detectionApi = {
  list: () =>
    request("/api/v1/detections", {
      headers: { ...authHeaders() },
    }),
};

export const lprApi = {
  recognize: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/v1/lpr/recognize", {
      method: "POST",
      headers: { ...authHeaders() },
      body: formData,
    });
  },
};

export const videoApi = {
  list: () =>
    request("/api/v1/videos", {
      headers: { ...authHeaders() },
    }),
  queue: (videoId, data) =>
    request(`/api/v1/videos/${videoId}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }),
  upload: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/v1/videos", {
      method: "POST",
      headers: { ...authHeaders() },
      body: formData,
    });
  },
};
