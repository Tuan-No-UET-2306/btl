import { getToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export const getWsBase = () => API_BASE.replace(/^http/, "ws");

class ApiError extends Error {
  constructor(message, code, status, errors) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.errors = errors;
  }
}

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);

  if (!response.ok) {
    try {
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : null;

      // Standardized error response: { success: false, code: "...", message: "...", errors: [...] }
      const message = payload?.message || payload?.detail || "Request failed.";
      const code = payload?.code || "unknown_error";
      const errors = payload?.errors || null;

      throw new ApiError(message, code, response.status, errors);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err instanceof SyntaxError) {
        throw new ApiError(`Request failed with status ${response.status}`, "http_error", response.status);
      }
      throw err;
    }
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  return null;
};

const downloadBlob = async (path, filename) => {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new ApiError("Download failed.", "download_error", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  search: (params) => {
    const q = new URLSearchParams();
    if (params.plate_number) q.set("plate_number", params.plate_number);
    if (params.date_from) q.set("date_from", params.date_from);
    if (params.date_to) q.set("date_to", params.date_to);
    if (params.is_blacklisted !== undefined && params.is_blacklisted !== null)
      q.set("is_blacklisted", params.is_blacklisted);
    q.set("page", String(params.page || 1));
    q.set("page_size", String(params.page_size || 20));
    return request(`/api/v1/detections/search?${q.toString()}`, {
      headers: { ...authHeaders() },
    });
  },
  all: (params) => {
    const q = new URLSearchParams();
    if (params.plate_number) q.set("plate_number", params.plate_number);
    if (params.date_from) q.set("date_from", params.date_from);
    if (params.date_to) q.set("date_to", params.date_to);
    if (params.is_blacklisted !== undefined && params.is_blacklisted !== null)
      q.set("is_blacklisted", params.is_blacklisted);
    q.set("page", String(params.page || 1));
    q.set("page_size", String(params.page_size || 20));
    return request(`/api/v1/detections/merged?${q.toString()}`, {
      headers: { ...authHeaders() },
    });
  },
  exportCsv: (params) => {
    const q = new URLSearchParams();
    if (params.plate_number) q.set("plate_number", params.plate_number);
    if (params.date_from) q.set("date_from", params.date_from);
    if (params.date_to) q.set("date_to", params.date_to);
    if (params.is_blacklisted !== undefined && params.is_blacklisted !== null)
      q.set("is_blacklisted", params.is_blacklisted);
    const qs = q.toString();
    downloadBlob(
      `/api/v1/detections/export${qs ? "?" + qs : ""}`,
      `detections_${new Date().toISOString().slice(0, 10)}.csv`
    );
  },
  stats: () =>
    request("/api/v1/detections/stats", {
      headers: { ...authHeaders() },
    }),
  bulkDelete: (ids) =>
    request("/api/v1/detections/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ ids }),
    }),
};

export const lprApi = {
  recognize: (file, options = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    const q = new URLSearchParams();
    if (options.persist === false) q.set("persist", "false");
    const qs = q.toString();
    return request(`/api/v1/lpr/recognize${qs ? "?" + qs : ""}`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: formData,
      signal: options.signal,
    });
  },
  recognizeRealtime: (file, options = {}) => {
    const formData = new FormData();
    formData.append("file", file);
    const q = new URLSearchParams();
    if (options.ocr !== undefined) q.set("ocr", String(Boolean(options.ocr)));
    if (options.cacheCrops !== undefined) q.set("cache_crops", String(Boolean(options.cacheCrops)));
    if (options.maxPlates) q.set("max_plates", String(options.maxPlates));
    if (options.minConfidence) q.set("min_confidence", String(options.minConfidence));
    const qs = q.toString();
    return request(`/api/v1/lpr/realtime-frame${qs ? "?" + qs : ""}`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: formData,
      signal: options.signal,
    });
  },
};

export const videoApi = {
  list: () =>
    request("/api/v1/videos", {
      headers: { ...authHeaders() },
    }),
  detections: (videoId) =>
    request(`/api/v1/videos/${videoId}/detections`, {
      headers: { ...authHeaders() },
    }),
  detail: (videoId) =>
    request(`/api/v1/videos/${videoId}`, {
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

export const blacklistApi = {
  list: () =>
    request("/api/v1/blacklist", {
      headers: { ...authHeaders() },
    }),
  check: (plateNumber) =>
    request(`/api/v1/blacklist/check/${encodeURIComponent(plateNumber)}`, {
      headers: { ...authHeaders() },
    }),
  create: (data) =>
    request("/api/v1/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    request(`/api/v1/blacklist/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    }),
  delete: (id) =>
    request(`/api/v1/blacklist/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    }),
};