import { useEffect, useState } from "react";

import { detectionApi } from "../api/client";

const formatConfidence = (value) => `${Math.round(value * 100)}%`;

export default function History() {
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);

    detectionApi
      .list()
      .then((items) => {
        if (!active) return;
        setDetections(items || []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load history.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="panel">
      <div className="panel-head">
        <span>Detection history</span>
        <span className="subtle">Latest plate events</span>
      </div>

      {loading ? (
        <div className="empty-state">Loading history...</div>
      ) : error ? (
        <div className="empty-state">{error}</div>
      ) : detections.length === 0 ? (
        <div className="empty-state">No detections recorded yet.</div>
      ) : (
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
      )}
    </section>
  );
}
