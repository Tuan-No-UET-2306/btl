import { useCallback, useEffect, useState } from "react";

import { detectionApi } from "../api/client";

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { page, page_size: 20 };
      if (plateSearch.trim()) params.plate_number = plateSearch.trim();
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) params.date_to = new Date(dateTo).toISOString();
      if (blacklistFilter !== "") params.is_blacklisted = blacklistFilter === "true";

      const result = await detectionApi.search(params);
      setDetections(result.items || []);
      setTotal(result.total || 0);
      setTotalPages(result.total_pages || 0);
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

  return (
    <section className="panel">
      <div className="panel-head">
        <span>Detection history</span>
        <span className="subtle">Latest plate events</span>
      </div>

      {/* Search & Filter Bar */}
      <form className="history-filters" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Search plate number..."
          value={plateSearch}
          onChange={(e) => setPlateSearch(e.target.value)}
        />
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
        <button className="btn btn-cool" type="submit">
          Search
        </button>
        <button className="btn" type="button" onClick={handleReset}>
          Reset
        </button>
        <button
          className="btn"
          type="button"
          onClick={handleExport}
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.08)", color: "#eef3ff" }}
        >
          Export CSV
        </button>
      </form>

      {loading ? (
        <div className="empty-state">Loading history...</div>
      ) : error ? (
        <div className="empty-state">{error}</div>
      ) : detections.length === 0 ? (
        <div className="empty-state">No detections recorded yet.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Confidence</th>
                  <th>Vehicle</th>
                  <th>Blacklist</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {detections.map((item) => (
                  <tr key={item.id}>
                    <td>{item.plate_number}</td>
                    <td>{formatConfidence(item.confidence)}</td>
                    <td>{item.vehicle_type || "-"}</td>
                    <td>{item.is_blacklisted ? "Yes" : "No"}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
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