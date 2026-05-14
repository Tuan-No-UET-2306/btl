import { useEffect, useRef, useState } from "react";
import { detectionApi, videoApi } from "../api/client";
import { Activity, AlertTriangle, BarChart3, Video, Eye, Upload } from "lucide-react";

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

  const statCards = [
    { title: "Detections Today", value: stats.today, meta: "Today's events", icon: Activity, color: "#2ad1ff" },
    { title: "This Week", value: stats.this_week, meta: "Last 7 days", icon: BarChart3, color: "#6f89ff" },
    { title: "Total Detections", value: stats.detections, meta: "All time", icon: Eye, color: "#f4b152" },
    { title: "Blacklisted", value: stats.blacklisted, meta: "Flagged plates", icon: AlertTriangle, color: "#ff6b6b", accent: true },
    { title: "Videos Queued", value: stats.videos, meta: "Uploads in pipeline", icon: Video, color: "#2ed573" },
  ];

  return (
    <section className="dashboard-body">
      <div className="stats">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className={`stat-card${card.accent ? " accent" : ""}`}>
              <div
                className="stat-card-icon"
                style={{ background: `${card.color}15`, color: card.color }}
              >
                <Icon size={18} />
              </div>
              <div className="stat-title">{card.title}</div>
              <div className="stat-value">{card.value}</div>
              <div className="stat-meta">{card.meta}</div>
            </div>
          );
        })}
      </div>

      {/* Daily chart */}
      {stats.daily_counts?.length > 0 && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <BarChart3 size={14} /> Detections — Last 7 Days
            </span>
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
                    <td><span className="status-badge info">{p.count} times</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Video size={14} /> Latest uploads
          </span>
          <span className="subtle">Queue status</span>
        </div>
        {recentVideos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Video size={32} />
            </div>
            <span>No video uploads yet.</span>
          </div>
        ) : (
          <ul className="video-list">
            {recentVideos.map((video) => (
              <li key={video.id} className="video-item">
                <div>
                  <div className="video-title">{video.filename || "Untitled"}</div>
                  <div className="video-meta">
                    <span className="status-badge warning">● {video.status || "queued"}</span>
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