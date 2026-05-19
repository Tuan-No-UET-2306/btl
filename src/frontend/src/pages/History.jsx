import { useCallback, useEffect, useState } from "react";
import { detectionApi } from "../api/client";
import { Search, RotateCcw, Download, Trash2, AlertCircle, Table } from "lucide-react";

const formatConfidence = (value) => `${Math.round(value * 100)}%`;

export default function History() {
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  // Filters
  const [plateSearch, setPlateSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [blacklistFilter, setBlacklistFilter] = useState("");

  // Bulk delete
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { page, page_size: 20 };
      if (plateSearch.trim()) params.plate_number = plateSearch.trim();
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo).toISOString();
      if (blacklistFilter !== "") params.is_blacklisted = blacklistFilter === "true";

      const result = await detectionApi.all(params);
      setDetections(result.items || []);
      setTotal(result.total || 0);
      setTotalPages(result.total_pages || 0);
      setSelectedIds([]);
    } catch (err) {
      setError(err.message || "Failed to load history.");
      setDetections([]);
    } finally {
      setLoading(false);
    }
  }, [page, plateSearch, dateFrom, dateTo, blacklistFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const handleReset = () => {
    setPlateSearch("");
    setDateFrom("");
    setDateTo("");
    setBlacklistFilter("");
    setPage(1);
  };

  const handleExport = () => {
    const params = {};
    if (plateSearch.trim()) params.plate_number = plateSearch.trim();
    if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
    if (dateTo) params.date_to = new Date(dateTo).toISOString();
    if (blacklistFilter !== "") params.is_blacklisted = blacklistFilter === "true";
    detectionApi.exportCsv(params);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === detections.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(detections.map((d) => d.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} detection(s)? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      await detectionApi.bulkDelete(selectedIds);
      setSelectedIds([]);
      fetchData();
    } catch (err) {
      setError(err.message || "Bulk delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveFilters = plateSearch || dateFrom || dateTo || blacklistFilter;

  return (
    <section className="panel">
      <div className="panel-head">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Table size={14} /> Detection history
        </span>
        <span className="subtle">Latest plate events</span>
      </div>

      {/* Search & Filter Bar */}
      <form className="history-filters" onSubmit={handleSearch}>
        <div style={{ position: "relative", flex: "0 1 auto", minWidth: 140 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search plate number..."
            value={plateSearch}
            onChange={(e) => setPlateSearch(e.target.value)}
            style={{ paddingLeft: 30, width: "100%" }}
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="To date"
        />
        <select
          value={blacklistFilter}
          onChange={(e) => setBlacklistFilter(e.target.value)}
        >
          <option value="">All status</option>
          <option value="true">Blacklisted</option>
          <option value="false">Not blacklisted</option>
        </select>
        <button className="btn btn-cool" type="submit" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Search size={14} /> Search
        </button>
        <button className="btn" type="button" onClick={handleReset} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", color: "#eef3ff" }}>
          <RotateCcw size={14} /> Reset
        </button>
        <button
          className="btn"
          type="button"
          onClick={handleExport}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", color: "#eef3ff" }}
        >
          <Download size={14} /> Export CSV
        </button>
      </form>

      {/* Active filters indicator */}
      {hasActiveFilters && (
        <div style={{ padding: "0 0 10px 0", fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={12} /> Filters active
        </div>
      )}

      {/* Bulk delete toolbar */}
      {selectedIds.length > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-info">{selectedIds.length} selected</span>
          <button
            className="btn"
            onClick={handleBulkDelete}
            disabled={deleting}
            style={{
              background: "rgba(255,60,60,0.2)",
              color: "#ff6b6b",
              padding: "6px 14px",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Trash2 size={14} /> {deleting ? "Deleting..." : `Delete (${selectedIds.length})`}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: "grid", gap: 12, padding: 12 }}>
          <div className="skeleton" style={{ height: 40 }} />
          <div className="skeleton" style={{ height: 40 }} />
          <div className="skeleton" style={{ height: 40 }} />
          <div className="skeleton" style={{ height: 40 }} />
        </div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} />
          <span>{error}</span>
        </div>
      ) : detections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Table size={32} />
          </div>
          <span>No detections recorded yet.</span>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === detections.length && detections.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Plate</th>
                  <th>Confidence</th>
                  <th>Vehicle</th>
                  <th>Blacklist</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {detections.map((item) => (
                  <tr
                    key={item.id}
                    className={selectedIds.includes(item.id) ? "row-selected" : ""}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td><strong>{item.plate_number}</strong></td>
                    <td><span className="status-badge info">{formatConfidence(item.confidence)}</span></td>
                    <td>{item.vehicle_type || "-"}</td>
                    <td>{item.is_blacklisted ? <span className="status-badge error">Yes</span> : <span className="status-badge success">No</span>}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">
                Page {page} of {totalPages} ({total} items)
              </span>
              <div className="pagination-buttons">
                <button
                  className="btn btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - page) <= 2
                  )
                  .map((p, idx, arr) => (
                    <span key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="pagination-ellipsis">...</span>
                      )}
                      <button
                        className={`btn btn-sm ${p === page ? "btn-cool" : ""}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
                <button
                  className="btn btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}