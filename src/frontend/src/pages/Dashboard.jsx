import { useEffect, useRef, useState } from "react";

import { detectionApi, videoApi, videoSocketUrl } from "../api/client";

export default function Dashboard() {
  const [stats, setStats] = useState({
    videos: 0,
    detections: 0,
  });
  const [recentVideos, setRecentVideos] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [liveVideo, setLiveVideo] = useState(null);
  const [liveStatus, setLiveStatus] = useState("idle");
  const [liveFrame, setLiveFrame] = useState(null);
  const [liveDetections, setLiveDetections] = useState([]);
  const [liveProgress, setLiveProgress] = useState(0);
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveSessionId, setLiveSessionId] = useState(0);
  const fileInputRef = useRef(null);
  const liveSocketRef = useRef(null);
  const queuedVideoIdsRef = useRef(new Set());

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

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return "00:00";
    const value = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(value / 60);
    const secs = value % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const addLiveEvent = (message) => {
    setLiveEvents((current) => [message, ...current].slice(0, 6));
  };

  const loadData = async (activeFlag) => {
    const [videos, detections] = await Promise.all([
      videoApi.list().catch(() => []),
      detectionApi.list().catch(() => []),
    ]);

    if (!activeFlag.current) return;
    setStats({
      videos: videos.length,
      detections: detections.length,
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

  useEffect(() => {
    if (!liveVideo?.id) return undefined;

    if (liveSocketRef.current) {
      liveSocketRef.current.close();
    }

    const socket = new WebSocket(videoSocketUrl(liveVideo.id));
    let manuallyClosed = false;
    liveSocketRef.current = socket;
    setLiveStatus("connecting");

    socket.onopen = async () => {
      setLiveStatus("queued");
      addLiveEvent("Realtime socket connected.");
      if (queuedVideoIdsRef.current.has(liveVideo.id)) return;

      queuedVideoIdsRef.current.add(liveVideo.id);
      try {
        await videoApi.queue(liveVideo.id);
        setLiveStatus("processing");
        addLiveEvent("Video processing started.");
      } catch (error) {
        setLiveStatus("failed");
        addLiveEvent(error.message || "Could not queue video.");
      }
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.event === "video_processing_started") {
        setLiveStatus("processing");
        setLiveProgress(0);
        addLiveEvent("Reading frames from uploaded video.");
      }
      if (payload.event === "video_frame") {
        setLiveStatus(payload.status || "processing");
        if (payload.frame) setLiveFrame(payload.frame);
        setLiveDetections(payload.detections || []);
        setLiveProgress(payload.progress || 0);
      }
      if (payload.event === "video_detection_created") {
        addLiveEvent(
          `${payload.plate_number} detected at ${formatTime(payload.timestamp_seconds)}.`
        );
      }
      if (payload.event === "video_processed") {
        setLiveStatus("done");
        setLiveProgress(1);
        addLiveEvent(`Processing complete: ${payload.detections_count || 0} plates saved.`);
        loadData({ current: true });
      }
      if (payload.event === "video_failed") {
        setLiveStatus("failed");
        addLiveEvent(payload.error || "Video processing failed.");
        loadData({ current: true });
      }
    };

    socket.onerror = () => {
      setLiveStatus("failed");
      addLiveEvent("Realtime socket error.");
    };

    socket.onclose = () => {
      if (!manuallyClosed) {
        addLiveEvent("Realtime socket closed.");
      }
    };

    return () => {
      manuallyClosed = true;
      socket.close();
    };
  }, [liveVideo?.id, liveSessionId]);

  const startLiveProcessing = (video) => {
    if (!video?.id) return;
    queuedVideoIdsRef.current.delete(video.id);
    setLiveVideo(video);
    setLiveFrame(null);
    setLiveDetections([]);
    setLiveProgress(0);
    setLiveEvents([`Ready: ${video.filename || "uploaded video"}`]);
    setLiveSessionId((current) => current + 1);
  };

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
      const video = await videoApi.upload(selectedFile);
      setUploadMessage("Upload complete. Realtime detection is starting.");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      startLiveProcessing(video);
      await loadData({ current: true });
    } catch (error) {
      setUploadMessage(error.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="dashboard-body">
      <div className="stats">
        <div className="stat-card">
          <div className="stat-title">Videos queued</div>
          <div className="stat-value">{stats.videos}</div>
          <div className="stat-meta">Uploads in the pipeline</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Detections logged</div>
          <div className="stat-value">{stats.detections}</div>
          <div className="stat-meta">Captured events</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-title">Realtime feed</div>
          <div className="stat-value">Online</div>
          <div className="stat-meta">Socket bridge ready</div>
        </div>
      </div>

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
              accept="video/*,.gif,image/gif"
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

      <div className="panel live-panel">
        <div className="panel-head">
          <span>Realtime video detection</span>
          <span className={`live-status ${liveStatus}`}>{liveStatus}</span>
        </div>
        <div className="live-grid">
          <div className="live-frame">
            {liveFrame ? (
              <img src={liveFrame} alt="Realtime detected video frame" />
            ) : (
              <div className="live-placeholder">
                Upload a video to start frame-by-frame detection.
              </div>
            )}
          </div>
          <div className="live-side">
            <div className="live-progress">
              <div
                className="live-progress-bar"
                style={{ width: `${Math.round((liveProgress || 0) * 100)}%` }}
              />
            </div>
            <div className="live-progress-text">
              {Math.round((liveProgress || 0) * 100)}% processed
            </div>
            <div className="live-section-title">Current frame detections</div>
            {liveDetections.length === 0 ? (
              <div className="empty-state">No plate in the current frame.</div>
            ) : (
              <ul className="live-detections">
                {liveDetections.map((detection, index) => (
                  <li key={`${detection.plate_number}-${index}`}>
                    <span>{detection.plate_number || "Plate"}</span>
                    <span>{Math.round((detection.confidence || 0) * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="live-section-title">Events</div>
            <ul className="live-events">
              {liveEvents.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
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
                <div className="video-actions">
                  <div className="video-meta">Detections: {video.detections_count}</div>
                  <button
                    className="btn btn-cool btn-sm"
                    type="button"
                    onClick={() => startLiveProcessing(video)}
                  >
                    Process
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
