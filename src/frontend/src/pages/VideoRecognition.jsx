import { useCallback, useEffect, useRef, useState } from "react";
import { videoApi } from "../api/client";
import {
  Upload,
  Video,
  Eye,
  RotateCcw,
  AlertCircle,
  Play,
} from "lucide-react";

export default function VideoRecognition() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [detections, setDetections] = useState([]);
  const [loadingDetections, setLoadingDetections] = useState(false);
  const [detectionError, setDetectionError] = useState("");
  const [processingVideoId, setProcessingVideoId] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null); // { id, video_url, filename }
  const fileInputRef = useRef(null);

  const loadVideos = useCallback(async () => {
    try {
      const data = await videoApi.list();
      setVideos(data || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

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
      await loadVideos();
    } catch (error) {
      setUploadMessage(error.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleQueueProcessing = async (videoId) => {
    setProcessingVideoId(videoId);
    try {
      await videoApi.queue(videoId, {});
      setUploadMessage("Video queued for processing. Refresh detections after processing.");
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, status: "processing" } : v))
      );
    } catch (error) {
      setUploadMessage(error.message || "Failed to queue video.");
    } finally {
      setProcessingVideoId(null);
    }
  };

  const handleViewDetections = async (video) => {
    setSelectedVideo(video);
    setDetections([]);
    setDetectionError("");
    setLoadingDetections(true);

    try {
      const data = await videoApi.detections(video.id);
      const dets = data || [];
      setDetections(dets);
      if (dets.length === 0) {
        if (video.status === "queued" || video.status === "processing") {
          setDetectionError("Video chưa được xử lý xong. Vui lòng nhấn 'Process' và đợi xử lý hoàn tất trước khi xem kết quả.");
        } else {
          setDetectionError("Video đã xử lý xong nhưng không phát hiện được biển số nào.");
        }
      }
    } catch (error) {
      setDetectionError(error.message || "Failed to load detections.");
    } finally {
      setLoadingDetections(false);
    }
  };

  const handlePlayVideo = async (video) => {
    setPlayingVideo(null);
    try {
      const detail = await videoApi.detail(video.id);
      setPlayingVideo({
        id: detail.id,
        video_url: detail.video_url,
        filename: detail.filename || "Untitled",
      });
    } catch (error) {
      setUploadMessage("Failed to load video: " + (error.message || "Unknown error"));
    }
  };

  const handleClosePlayer = () => {
    setPlayingVideo(null);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const videoStatusBadge = (status) => {
    switch (status) {
      case "done":
        return <span className="status-badge success">● Done</span>;
      case "processing":
        return <span className="status-badge warning">● Processing</span>;
      case "queued":
      default:
        return <span className="status-badge info">● Queued</span>;
    }
  };

  return (
    <section className="dashboard-body">
      {/* Upload Panel */}
      <div className="panel" style={{ minHeight: "auto" }}>
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Upload size={14} /> Upload Video
          </span>
          <span className="subtle">mp4, avi, mov supported</span>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn-cool"
              type="submit"
              disabled={uploading || !selectedFile}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Upload size={16} /> {uploading ? "Uploading..." : "Upload & Queue"}
            </button>
            {selectedFile && (
              <button
                className="btn"
                type="button"
                onClick={handleReset}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef3ff",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RotateCcw size={14} /> Reset
              </button>
            )}
          </div>
        </form>

        <div className={`message ${uploadMessage ? "" : "muted"}`}>
          {uploadMessage || " "}
        </div>
      </div>

      {/* Video List Panel */}
      <div className="panel" style={{ minHeight: "auto" }}>
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Video size={14} /> Your Videos
          </span>
          <span className="subtle">{videos.length} video(s)</span>
        </div>

        {videos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Video size={32} />
            </div>
            <span>No videos uploaded yet. Upload a video to get started.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Status</th>
                  <th>Detections</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
        {videos.map((video) => (
                  <tr key={video.id} className={selectedVideo?.id === video.id ? "row-selected" : ""}>
                    <td>
                      <strong>{video.filename || "Untitled"}</strong>
                    </td>
                    <td>{videoStatusBadge(video.status)}</td>
                    <td>
                      <span className="status-badge info">
                        {video.detections_count ?? 0} plates
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(video.uploaded_at).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-sm btn-cool"
                          onClick={() => handleViewDetections(video)}
                          title="View detections"
                          style={{ display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <Eye size={14} /> View
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => handlePlayVideo(video)}
                          title="Play video"
                          style={{
                            background: "rgba(42,209,255,0.15)",
                            color: "#2ad1ff",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Play size={14} /> Play
                        </button>
                        {video.status !== "processing" && video.status !== "done" && (
                          <button
                            className="btn btn-sm"
                            onClick={() => handleQueueProcessing(video.id)}
                            disabled={processingVideoId === video.id}
                            style={{
                              background: "rgba(255,255,255,0.08)",
                              color: "#eef3ff",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {processingVideoId === video.id ? "..." : "Process"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Video Player Panel */}
      {playingVideo && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Play size={14} /> Now Playing — {playingVideo.filename}
            </span>
            <button
              className="btn btn-sm"
              onClick={handleClosePlayer}
              style={{
                background: "rgba(255,60,60,0.2)",
                color: "#ff6b6b",
              }}
            >
              Close
            </button>
          </div>
          <div className="webcam-view">
            <video
              className="webcam-video"
              src={playingVideo.video_url}
              controls
              style={{ width: "100%", maxHeight: 480 }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      )}

      {/* Detection Results Panel */}
      {selectedVideo && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Eye size={14} /> Detections — {selectedVideo.filename || "Untitled"}
            </span>
            <span className="subtle">{detections.length} plate(s) found</span>
          </div>

          {loadingDetections ? (
            <div style={{ display: "grid", gap: 12, padding: 12 }}>
              <div className="skeleton" style={{ height: 40 }} />
              <div className="skeleton" style={{ height: 40 }} />
              <div className="skeleton" style={{ height: 40 }} />
            </div>
          ) : detectionError ? (
            <div className="empty-state" style={{ color: "#ff6b6b" }}>
              <AlertCircle size={24} />
              <span>{detectionError}</span>
            </div>
          ) : detections.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Plate Number</th>
                    <th>Confidence</th>
                    <th>Frame</th>
                    <th>Timestamp</th>
                    <th>Blacklisted</th>
                    <th>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.map((det) => (
                    <tr key={det.id}>
                      <td>
                        <strong>{det.plate_number}</strong>
                      </td>
                      <td>
                        <span className="status-badge info">
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </td>
                      <td>{det.frame_number ?? "-"}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>
                        {det.timestamp_seconds
                          ? `${det.timestamp_seconds.toFixed(1)}s`
                          : "-"}
                      </td>
                      <td>
                        {det.is_blacklisted ? (
                          <span className="status-badge error">Yes</span>
                        ) : (
                          <span className="status-badge success">No</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>
                        {new Date(det.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Eye size={32} />
              </div>
              <span>No detections recorded for this video.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}