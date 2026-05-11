import { useEffect, useRef, useState } from "react";

import { detectionApi, videoApi } from "../api/client";

export default function Dashboard() {
  const [stats, setStats] = useState({
    videos: 0,
    detections: 0,
    today: 0,
    this_week: 0,
    blacklisted: 0,
    top_plates: [],
    daily_counts: [],
  });
  const [recentVideos, setRecentVideos] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const formatBytes = (size) => {
    if (!size) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = size;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const precision = value >= 10 || index === 0 ? 0 : 1;
    return `${value.toFixed(precision)} ${units[index]}`;
  };

  const loadData = async (activeFlag) => {
    const [videos, detections, detStats] = await Promise.all([
      videoApi.list().catch(() => []),
      detectionApi.list().catch(() => []),
      detectionApi.stats().catch(() => null),
    ]);

    if (!activeFlag.current) return;

    setStats({
      videos: videos.length,
      detections: detections.length,
      today: detStats?.today || 0,
      this_week: detStats?.this_week || 0,
      blacklisted: detStats?.blacklisted || 0,
      top_plates: detStats?.top_plates || [],
      daily_counts: detStats?.daily_counts || [],
    });
    setRecentVideos(videos.slice(0, 5));
  };

  useEffect(() => {
    const activeFlag = { current: true };
    loadData(activeFlag);
    return () => {
      activeFlag.current = false;
    };
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadMessage("");
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setUploadMessage("Please choose a video file first.");
      return;
    }

    setUploading(true);
    setUploadMessage("");
    try {
      await videoApi.upload(selectedFile);
      setUploadMessage("Upload complete. The video is queued for processing.");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadData({ current: true });
    } catch (error) {
      setUploadMessage(error.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const maxDailyCount = Math.max(...(stats.daily_counts?.map((d) => d.count) || [0]), 1);

  return (
    <section className="dashboard-body">
      <div className="stats">
        <div className="stat-card">
          <div className="stat-title">Detections Today</div>
          <div className="stat-value">{stats.today}</div>
          <div className="stat-meta">Today's events</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">This Week</div>
          <div className="stat-value">{stats.this_week}</div>
          <div className="stat-meta">Last 7 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Total Detections</div>
          <div className="stat-value">{stats.detections}</div>
          <div className="stat-meta">All time</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-title">Blacklisted</div>
          <div className="stat-value">{stats.blacklisted}</div>
          <div className="stat-meta">Flagged plates</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Videos queued</div>
          <div className="stat-value">{stats.videos}</div>
          <div className="stat-meta">Uploads in the pipeline</div>
        </div>
      </div>

      {/* Daily chart */}
      {stats.daily_counts?.length > 0 && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span>Detections — Last 7 Days</span>
            <span className="subtle">Daily count</span>
          </div>
          <div className="daily-chart">
            {stats.daily_counts.map((day) => (
              <div key={day.date} className="daily-chart-bar-wrap">
                <div className="daily-chart-label">{day.date.slice(5)}</div>
                <div className="daily-chart-bar-container">
                  <div
                    className="daily-chart-bar"
                    style={{ height: `${Math.max((day.count / maxDailyCount) * 100, 4)}%` }}
                  />
                </div>
                <div className="daily-chart-value">{day.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top plates */}
      {stats.top_plates?.length > 0 && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span>Top Plates</span>
            <span className="subtle">Most frequently detected</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Plate Number</th>
                  <th>Detections</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_plates.map((p, i) => (
                  <tr key={p.plate_number}>
                    <td>{i + 1}</td>
                    <td><strong>{p.plate_number}</strong></td>
                    <td>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel upload-panel">
        <div className="panel-head">
          <span>Upload video</span>
          <span className="subtle">Stored in MinIO</span>
        </div>
        <form className="upload-form" onSubmit={handleUpload}>
          <div className="upload-field">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
            />
            <div className="upload-meta">
              {selectedFile
                ? `${selectedFile.name} - ${formatBytes(selectedFile.size)}`
                : "Choose a video file to upload"}
            </div>
          </div>
          <button
            className="btn btn-cool"
            type="submit"
            disabled={uploading || !selectedFile}
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>
        <div className={`message ${uploadMessage ? "" : "muted"}`}>
          {uploadMessage || " "}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span>Latest uploads</span>
          <span className="subtle">Queue status</span>
        </div>
        {recentVideos.length === 0 ? (
          <div className="empty-state">No video uploads yet.</div>
        ) : (
          <ul className="video-list">
            {recentVideos.map((video) => (
              <li key={video.id} className="video-item">
                <div>
                  <div className="video-title">{video.filename || "Untitled"}</div>
                  <div className="video-meta">
                    Status: {video.status || "queued"}
                  </div>
                </div>
                <div className="video-meta">Detections: {video.detections_count}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}