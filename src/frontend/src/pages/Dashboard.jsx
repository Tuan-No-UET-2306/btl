import { useEffect, useRef, useState } from "react";
import { detectionApi, videoApi } from "../api/client";
import { Activity, AlertTriangle, BarChart3, Video, Eye } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState({
    videos: 0,
    detections: 0,
    today: 0,
    this_week: 0,
    blacklisted: 0,
    blacklist_count: 0,
    video_queue_count: 0,
    top_plates: [],
    daily_counts: [],
  });
  const [recentVideos, setRecentVideos] = useState([]);
  const loadData = async (activeFlag) => {
    // Use stats endpoint for aggregate counts and extra data,
    // then fetch recent videos separately for the list.
    const [detStats, videos] = await Promise.all([
      detectionApi.stats().catch(() => null),
      videoApi.list().catch(() => []),
    ]);

    if (!activeFlag.current) return;

    setStats({
      videos: videos.length,
      detections: detStats?.total || 0,
      today: detStats?.today || 0,
      this_week: detStats?.this_week || 0,
      blacklisted: detStats?.blacklisted || 0,
      blacklist_count: detStats?.blacklist_count || 0,
      video_queue_count: detStats?.video_queue_count || 0,
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

  const maxDailyCount = Math.max(...(stats.daily_counts?.map((d) => d.count) || [0]), 1);

  const statCards = [
    { title: "Detections Today", value: stats.today, meta: "Today's events", icon: Activity, color: "#2ad1ff" },
    { title: "This Week", value: stats.this_week, meta: "Last 7 days", icon: BarChart3, color: "#6f89ff" },
    { title: "Total Detections", value: stats.detections, meta: "All time", icon: Eye, color: "#f4b152" },
    { title: "Blacklisted Plates", value: stats.blacklist_count, meta: "Plates in blacklist", icon: AlertTriangle, color: "#ff6b6b", accent: true },
    { title: "Videos in Queue", value: stats.video_queue_count, meta: "Uploads in pipeline", icon: Video, color: "#2ed573" },
  ];

  return (
    <section className="dashboard-body">
      <div className="stats">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className={`stat-card${card.accent ? " accent" : ""}`}
              style={{
                transition: "all 0.25s cubic-bezier(0.2, 0, 0, 1)",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-6px)";
                e.currentTarget.style.boxShadow = "0 20px 30px -12px rgba(0,0,0,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div
                className="stat-card-icon"
                style={{
                  background: `${card.color}15`,
                  color: card.color,
                  transition: "transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
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
        <div className="panel" style={{ minHeight: "auto", transition: "all 0.2s" }}>
          <div className="panel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <BarChart3 size={14} /> Detections — Last 7 Days
            </span>
            <span className="subtle">Daily count</span>
          </div>
          <div className="daily-chart">
            {stats.daily_counts.map((day, idx) => (
              <div
                key={day.date}
                className="daily-chart-bar-wrap"
                style={{
                  animation: `fadeInUp 0.3s ease ${idx * 0.05}s both`,
                }}
              >
                <div className="daily-chart-label">{day.date.slice(5)}</div>
                <div className="daily-chart-bar-container">
                  <div
                    className="daily-chart-bar"
                    style={{
                      height: `${Math.max((day.count / maxDailyCount) * 100, 4)}%`,
                      transition: "height 0.5s cubic-bezier(0.2, 0.9, 0.4, 1.1)",
                    }}
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
        <div className="panel" style={{ minHeight: "auto", transition: "all 0.2s" }}>
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
                  <tr
                    key={p.plate_number}
                    style={{
                      transition: "background 0.2s, transform 0.1s",
                      cursor: "default",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td>{i + 1}</td>
                    <td>
                      <strong>{p.plate_number}</strong>
                    </td>
                    <td>
                      <span className="status-badge info">{p.count} times</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" style={{ transition: "all 0.2s" }}>
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
              <li
                key={video.id}
                className="video-item"
                style={{
                  transition: "all 0.2s ease",
                  cursor: "default",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
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

      {/* Thêm keyframes animation cho fadeInUp */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}