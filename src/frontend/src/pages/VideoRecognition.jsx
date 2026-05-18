import { useCallback, useEffect, useRef, useState } from "react";
import { getWsBase, videoApi } from "../api/client";
import {
  Upload,
  Video,
  Eye,
  RotateCcw,
  AlertCircle,
  Play,
} from "lucide-react";

const DETECTION_HOLD_SECONDS = 0.85;

const getDetectionTimestamp = (detection) => {
  const value = Number(detection?.timestamp_seconds);
  return Number.isFinite(value) ? value : null;
};

const hasOverlayMetadata = (detection) =>
  Array.isArray(detection?.bbox) &&
  detection.bbox.length === 4 &&
  detection.bbox.every((value) => Number.isFinite(Number(value)));

const appendUniqueDetection = (items, detection) => {
  if (!detection) return items;
  if (detection.id !== undefined && items.some((item) => item.id === detection.id)) {
    return items;
  }

  return [...items, detection].sort((a, b) => {
    const timeA = getDetectionTimestamp(a) ?? Number.MAX_SAFE_INTEGER;
    const timeB = getDetectionTimestamp(b) ?? Number.MAX_SAFE_INTEGER;
    return timeA - timeB;
  });
};

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
  const [playbackDetections, setPlaybackDetections] = useState([]);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerLayout, setPlayerLayout] = useState({
    width: 0,
    height: 0,
    sourceWidth: 0,
    sourceHeight: 0,
  });
  const [progressByVideo, setProgressByVideo] = useState({});
  const fileInputRef = useRef(null);
  const selectedVideoRef = useRef(null);
  const playingVideoRef = useRef(null);
  const playerStageRef = useRef(null);
  const playerVideoRef = useRef(null);

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

  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);

  useEffect(() => {
    playingVideoRef.current = playingVideo;
  }, [playingVideo]);

  const updatePlayerLayout = useCallback(() => {
    const stage = playerStageRef.current;
    const video = playerVideoRef.current;
    if (!stage || !video) return;

    const next = {
      width: stage.clientWidth,
      height: stage.clientHeight,
      sourceWidth: video.videoWidth || 0,
      sourceHeight: video.videoHeight || 0,
    };

    setPlayerLayout((prev) =>
      prev.width === next.width &&
      prev.height === next.height &&
      prev.sourceWidth === next.sourceWidth &&
      prev.sourceHeight === next.sourceHeight
        ? prev
        : next
    );
  }, []);

  useEffect(() => {
    if (!playingVideo) return undefined;

    updatePlayerLayout();
    window.addEventListener("resize", updatePlayerLayout);

    let observer = null;
    if (typeof ResizeObserver !== "undefined" && playerStageRef.current) {
      observer = new ResizeObserver(updatePlayerLayout);
      observer.observe(playerStageRef.current);
    }

    return () => {
      window.removeEventListener("resize", updatePlayerLayout);
      if (observer) observer.disconnect();
    };
  }, [playingVideo, updatePlayerLayout]);

  useEffect(() => {
    if (!playingVideo) return undefined;

    const syncTime = () => {
      const video = playerVideoRef.current;
      if (video) {
        setPlayerTime(video.currentTime || 0);
      }
    };

    syncTime();
    const intervalId = window.setInterval(syncTime, 120);
    return () => window.clearInterval(intervalId);
  }, [playingVideo]);

  useEffect(() => {
    const socket = new WebSocket(`${getWsBase()}/api/v1/ws/stream`);

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleRealtimeEvent(payload);
      } catch {
        // Ignore malformed websocket messages.
      }
    };

    return () => socket.close();
  }, []);

  const handleRealtimeEvent = (payload) => {
    const videoId = payload?.video_id;
    if (!videoId) return;

    if (
      payload.event === "video_processing_started" ||
      payload.event === "video_progress" ||
      payload.event === "video_detection_created" ||
      payload.event === "video_processed" ||
      payload.event === "video_failed"
    ) {
      setProgressByVideo((prev) => ({
        ...prev,
        [videoId]: {
          ...(prev[videoId] || {}),
          progress:
            payload.progress !== undefined
              ? payload.progress
              : payload.event === "video_processing_started"
                ? 0
                : prev[videoId]?.progress,
          processed_frames: payload.processed_frames ?? prev[videoId]?.processed_frames,
          frame_number: payload.frame_number ?? prev[videoId]?.frame_number,
          total_frames: payload.total_frames ?? prev[videoId]?.total_frames,
          detections_count: payload.detections_count ?? prev[videoId]?.detections_count,
          error: payload.error || "",
        },
      }));
    }

    if (payload.status || payload.detections_count !== undefined) {
      setVideos((prev) =>
        prev.map((video) =>
          video.id === videoId
            ? {
                ...video,
                status: payload.status || video.status,
                detections_count:
                  payload.detections_count !== undefined
                    ? payload.detections_count
                    : video.detections_count,
              }
            : video
        )
      );
    }

    if (payload.event === "video_detection_created" && payload.detection) {
      if (selectedVideoRef.current?.id === videoId) {
        setDetectionError("");
        setDetections((prev) => {
          if (prev.some((item) => item.id === payload.detection.id)) return prev;
          return [payload.detection, ...prev];
        });
      }

      if (playingVideoRef.current?.id === videoId) {
        setPlaybackDetections((prev) => appendUniqueDetection(prev, payload.detection));
      }
    }

    if (payload.event === "video_processed") {
      loadVideos();
    }
  };

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
      const uploaded = await videoApi.upload(selectedFile);
      setPlayingVideo({
        id: uploaded.id,
        video_url: uploaded.video_url,
        filename: uploaded.filename || selectedFile.name,
      });
      setPlaybackDetections([]);
      setPlayerTime(0);
      await videoApi.queue(uploaded.id, {});
      setUploadMessage("Upload complete. Realtime processing started in Redis queue.");
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

  const openVideoPlayer = async (video) => {
    const detail = await videoApi.detail(video.id);
    setPlayingVideo({
      id: detail.id,
      video_url: detail.video_url,
      filename: detail.filename || "Untitled",
    });
    setPlaybackDetections(detail.detections || []);
    setPlayerTime(0);
    updatePlayerLayout();
    return detail;
  };

  const handleQueueProcessing = async (video) => {
    const videoId = video.id;
    setProcessingVideoId(videoId);
    try {
      await videoApi.queue(videoId, {});
      setUploadMessage("Video queued for realtime processing.");
      setVideos((prev) =>
          prev.map((v) => (v.id === videoId ? { ...v, status: "processing" } : v))
      );
      await openVideoPlayer(video);
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
          setDetectionError("Video đang chờ hoặc đang được xử lý. Kết quả sẽ tự cập nhật khi worker phát hiện biển số.");
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
      await openVideoPlayer(video);
    } catch (error) {
      setUploadMessage("Failed to load video: " + (error.message || "Unknown error"));
    }
  };

  const handleClosePlayer = () => {
    setPlayingVideo(null);
    setPlaybackDetections([]);
    setPlayerTime(0);
    setPlayerLayout({ width: 0, height: 0, sourceWidth: 0, sourceHeight: 0 });
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
      case "failed":
        return <span className="status-badge error">● Failed</span>;
      case "queued":
      default:
        return <span className="status-badge info">● Queued</span>;
    }
  };

  const activePlaybackDetections = playbackDetections.filter((detection) => {
    if (!hasOverlayMetadata(detection)) return false;
    const timestamp = getDetectionTimestamp(detection);
    if (timestamp === null) return false;
    return (
      playerTime >= timestamp - 0.15 &&
      playerTime <= timestamp + DETECTION_HOLD_SECONDS
    );
  });

  const overlayDetectionsCount = playbackDetections.filter(hasOverlayMetadata).length;

  const getOverlayBoxStyle = (detection) => {
    if (!hasOverlayMetadata(detection) || playerLayout.width <= 0 || playerLayout.height <= 0) {
      return { display: "none" };
    }

    const sourceWidth = Number(detection.frame_width) || playerLayout.sourceWidth || 1;
    const sourceHeight = Number(detection.frame_height) || playerLayout.sourceHeight || 1;
    const [rawX1, rawY1, rawX2, rawY2] = detection.bbox.map(Number);
    const x1 = Math.max(0, Math.min(sourceWidth, Math.min(rawX1, rawX2)));
    const x2 = Math.max(0, Math.min(sourceWidth, Math.max(rawX1, rawX2)));
    const y1 = Math.max(0, Math.min(sourceHeight, Math.min(rawY1, rawY2)));
    const y2 = Math.max(0, Math.min(sourceHeight, Math.max(rawY1, rawY2)));
    const scale = Math.min(playerLayout.width / sourceWidth, playerLayout.height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const offsetX = (playerLayout.width - renderedWidth) / 2;
    const offsetY = (playerLayout.height - renderedHeight) / 2;

    return {
      left: `${offsetX + x1 * scale}px`,
      top: `${offsetY + y1 * scale}px`,
      width: `${Math.max(2, (x2 - x1) * scale)}px`,
      height: `${Math.max(2, (y2 - y1) * scale)}px`,
    };
  };

  const formatOverlayLabel = (detection) => {
    return detection.plate_number && detection.plate_number !== "UNKNOWN"
      ? detection.plate_number
      : "";
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
                {videos.map((video) => {
                  const liveProgress = progressByVideo[video.id] || {};
                  const detectionsCount =
                    liveProgress.detections_count ?? video.detections_count ?? 0;
                  const progressValue =
                    typeof liveProgress.progress === "number" ? liveProgress.progress : null;

                  return (
                  <tr key={video.id} className={selectedVideo?.id === video.id ? "row-selected" : ""}>
                    <td>
                      <strong>{video.filename || "Untitled"}</strong>
                    </td>
                    <td>
                      <div className="video-status-stack">
                        {videoStatusBadge(video.status)}
                        {video.status === "processing" && (
                          <div className="video-progress">
                            <div
                              className="video-progress-fill"
                              style={{ width: `${progressValue ?? 8}%` }}
                            />
                          </div>
                        )}
                        {video.status === "processing" && (
                          <span className="video-progress-text">
                            {progressValue !== null
                              ? `${Math.round(progressValue)}%`
                              : "Processing"}{" "}
                            {liveProgress.frame_number !== undefined
                              ? `frame ${liveProgress.frame_number}`
                              : ""}
                          </span>
                        )}
                        {video.status === "failed" && liveProgress.error && (
                          <span className="video-progress-text error">{liveProgress.error}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="status-badge info">
                        {detectionsCount} plates
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
                            onClick={() => handleQueueProcessing(video)}
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
                  );
                })}
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
            <div className="lpr-player-actions">
              <span className="subtle">{overlayDetectionsCount} boxed frame(s)</span>
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
          </div>
          <div className="webcam-view lpr-video-view">
            <div className="lpr-video-stage" ref={playerStageRef}>
              <video
                ref={playerVideoRef}
                className="webcam-video lpr-video"
                src={playingVideo.video_url}
                controls
                autoPlay
                muted
                playsInline
                onLoadedMetadata={updatePlayerLayout}
                onLoadedData={updatePlayerLayout}
                onTimeUpdate={(event) => setPlayerTime(event.currentTarget.currentTime || 0)}
                onSeeked={(event) => setPlayerTime(event.currentTarget.currentTime || 0)}
              >
                Your browser does not support the video tag.
              </video>
              <div className="lpr-video-overlay" aria-hidden="true">
                {activePlaybackDetections.map((detection) => (
                  <div
                    key={`${detection.id ?? "live"}-${detection.frame_number ?? "frame"}`}
                    className={`lpr-video-box ${detection.is_blacklisted ? "blacklisted" : ""}`}
                    style={getOverlayBoxStyle(detection)}
                  >
                    {formatOverlayLabel(detection) && (
                      <span className="lpr-video-label">{formatOverlayLabel(detection)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lpr-player-strip">
            <span>{playerTime.toFixed(1)}s</span>
            <span>{activePlaybackDetections.length} active</span>
            <span>{playbackDetections.length} detection event(s)</span>
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
                        {typeof det.timestamp_seconds === "number"
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
