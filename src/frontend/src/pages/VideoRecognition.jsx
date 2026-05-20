import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lprApi, videoApi } from "../api/client";
import {
  AlertCircle,
  Eye,
  Play,
  RotateCcw,
  ScanLine,
  Square,
  Upload,
  Video,
} from "lucide-react";

const DETECTION_HOLD_SECONDS = 1.5;
const REALTIME_SCAN_INTERVAL_MS = 900;
const REALTIME_MIN_FRAME_DELTA_SECONDS = 0.8;
const REALTIME_OCR_EVERY_N_SCANS = 1;
const REALTIME_MAX_PLATES = 2;
const REALTIME_MIN_CONFIDENCE = 0.35;
const MAX_CAPTURE_WIDTH = 720;
const JPEG_CAPTURE_QUALITY = 0.68;
const TRACK_TTL_SECONDS = 2.2;
const TRACK_MATCH_IOU = 0.12;
const TRACK_MATCH_DISTANCE = 1.35;
const MAX_ACTIVE_TRACKS = 8;
const MIN_TRACK_HITS_TO_SHOW = 2;

const getDetectionTimestamp = (detection) => {
  const value = Number(detection?.timestamp_seconds);
  return Number.isFinite(value) ? value : null;
};

const hasOverlayMetadata = (detection) =>
  Array.isArray(detection?.bbox) &&
  detection.bbox.length === 4 &&
  detection.bbox.every((value) => Number.isFinite(Number(value)));

const normalizeBbox = (bbox) => {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const values = bbox.map((value) => Math.round(Number(value)));
  return values.every(Number.isFinite) ? values : null;
};

const getBboxInfo = (bbox) => {
  if (!bbox) return null;
  const [rawX1, rawY1, rawX2, rawY2] = bbox.map(Number);
  const x1 = Math.min(rawX1, rawX2);
  const y1 = Math.min(rawY1, rawY2);
  const x2 = Math.max(rawX1, rawX2);
  const y2 = Math.max(rawY1, rawY2);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;
  return {
    x1,
    y1,
    x2,
    y2,
    width,
    height,
    area: width * height,
    cx: x1 + width / 2,
    cy: y1 + height / 2,
    diagonal: Math.hypot(width, height),
  };
};

const getBboxIou = (bboxA, bboxB) => {
  const a = getBboxInfo(bboxA);
  const b = getBboxInfo(bboxB);
  if (!a || !b) return 0;

  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  const intersection = width * height;
  const union = a.area + b.area - intersection;
  return union > 0 ? intersection / union : 0;
};

const getCenterDistanceScore = (bboxA, bboxB) => {
  const a = getBboxInfo(bboxA);
  const b = getBboxInfo(bboxB);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const scale = Math.max(a.diagonal, b.diagonal, 32);
  return distance / scale;
};

const smoothBbox = (previous, next, alpha = 0.72) => {
  if (!previous) return next;
  return next.map((value, index) =>
    Math.round(previous[index] * (1 - alpha) + value * alpha)
  );
};

const hasUsablePlateText = (plateNumber) =>
  Boolean(
    plateNumber &&
      plateNumber !== "UNKNOWN" &&
      String(plateNumber).replace(/[^a-z0-9]/gi, "").length >= 5
  );

const normalizePlateKey = (plateNumber) =>
  String(plateNumber || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

const addPlateVote = (votes = {}, detection) => {
  if (!hasUsablePlateText(detection.plate_number)) return votes;
  const key = normalizePlateKey(detection.plate_number);
  if (!key) return votes;

  const current = votes[key] || {
    text: detection.plate_number,
    count: 0,
    confidence: 0,
  };
  return {
    ...votes,
    [key]: {
      text: detection.plate_number,
      count: current.count + 1,
      confidence: Math.max(
        current.confidence,
        Number(detection.ocr_confidence || detection.confidence) || 0
      ),
    },
  };
};

const getBestVotedPlate = (votes) => {
  const candidates = Object.values(votes || {});
  if (candidates.length === 0) return "";
  candidates.sort((a, b) => b.count - a.count || b.confidence - a.confidence);
  return candidates[0].text;
};

const isPlateLikeDetection = (detection) => {
  const info = getBboxInfo(detection.bbox);
  if (!info) return false;

  const frameWidth = Number(detection.frame_width) || 1;
  const frameHeight = Number(detection.frame_height) || 1;
  const areaRatio = info.area / Math.max(1, frameWidth * frameHeight);
  const aspectRatio = info.width / info.height;
  const confidence = Number(detection.confidence) || 0;
  const detectConfidence = Number(detection.detect_confidence) || confidence;

  if (areaRatio < 0.00004 || areaRatio > 0.06) return false;
  if (aspectRatio < 0.8 || aspectRatio > 9.5) return false;
  if (!hasUsablePlateText(detection.plate_number) && detectConfidence < 0.28) return false;
  return true;
};

const suppressDuplicateDetections = (detections) => {
  const kept = [];
  const sorted = [...detections].sort(
    (a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0)
  );

  for (const detection of sorted) {
    const duplicated = kept.some((item) => {
      const samePlate =
        hasUsablePlateText(item.plate_number) &&
        item.plate_number === detection.plate_number;
      return (
        getBboxIou(item.bbox, detection.bbox) > 0.28 ||
        getCenterDistanceScore(item.bbox, detection.bbox) < (samePlate ? 1.25 : 0.65)
      );
    });
    if (!duplicated) kept.push(detection);
  }

  return kept;
};

const pickTrackPlateNumber = (track, detection, votes) => {
  const votedPlate = getBestVotedPlate(votes);
  if (votedPlate) return votedPlate;
  return track?.plate_number || detection.plate_number || "UNKNOWN";
};

const isStableTrack = (track) =>
  track.hits >= MIN_TRACK_HITS_TO_SHOW ||
  (hasUsablePlateText(track.plate_number) && Number(track.confidence) >= 0.9);

const pruneTracks = (tracks, timestamp) =>
  tracks
    .filter((track) => timestamp - track.lastSeen <= TRACK_TTL_SECONDS)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, MAX_ACTIVE_TRACKS);

const updateDetectionTracks = (tracks, detections, timestamp, nextTrackId) => {
  const liveTracks = pruneTracks(tracks, timestamp).map((track) => ({
    ...track,
    matched: false,
  }));

  for (const detection of detections) {
    let bestTrack = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const track of liveTracks) {
      if (track.matched) continue;

      const iou = getBboxIou(track.bbox, detection.bbox);
      const distanceScore = getCenterDistanceScore(track.bbox, detection.bbox);
      const samePlate =
        hasUsablePlateText(track.plate_number) &&
        track.plate_number === detection.plate_number;

      if (!samePlate && iou < TRACK_MATCH_IOU && distanceScore > TRACK_MATCH_DISTANCE) {
        continue;
      }

      const score = distanceScore - iou * 1.8 - (samePlate ? 0.55 : 0);
      if (score < bestScore) {
        bestScore = score;
        bestTrack = track;
      }
    }

    if (bestTrack) {
      const plateVotes = addPlateVote(bestTrack.plateVotes, detection);
      bestTrack.bbox = smoothBbox(bestTrack.bbox, detection.bbox);
      bestTrack.plateVotes = plateVotes;
      bestTrack.plate_number = pickTrackPlateNumber(bestTrack, detection, plateVotes);
      bestTrack.confidence = Math.max(bestTrack.confidence, detection.confidence);
      bestTrack.detect_confidence = Math.max(
        Number(bestTrack.detect_confidence) || 0,
        Number(detection.detect_confidence) || 0
      );
      bestTrack.ocr_confidence = Math.max(
        Number(bestTrack.ocr_confidence) || 0,
        Number(detection.ocr_confidence) || 0
      );
      bestTrack.timestamp_seconds = detection.timestamp_seconds;
      bestTrack.image_url = detection.image_url || bestTrack.image_url;
      bestTrack.crop_cache_key = detection.crop_cache_key || bestTrack.crop_cache_key;
      bestTrack.lastSeen = timestamp;
      bestTrack.frame_width = detection.frame_width;
      bestTrack.frame_height = detection.frame_height;
      bestTrack.created_at = detection.created_at;
      bestTrack.hits += 1;
      bestTrack.matched = true;
    } else {
      const plateVotes = addPlateVote({}, detection);
      liveTracks.push({
        ...detection,
        id: `track-${nextTrackId()}`,
        plateVotes,
        plate_number: getBestVotedPlate(plateVotes) || detection.plate_number || "UNKNOWN",
        firstSeen: timestamp,
        lastSeen: timestamp,
        hits: 1,
        matched: true,
      });
    }
  }

  return pruneTracks(
    liveTracks.map(({ matched, ...track }) => track),
    timestamp
  );
};

const buildPlateSummaries = (detections) => {
  const byPlate = new Map();
  for (const detection of detections || []) {
    if (!hasUsablePlateText(detection.plate_number)) continue;

    const key = normalizePlateKey(detection.plate_number);
    const current = byPlate.get(key) || {
      plate_number: detection.plate_number,
      count: 0,
      confidence: 0,
      is_blacklisted: false,
      first_timestamp_seconds: detection.timestamp_seconds,
      image_url: detection.image_url,
      detections: [],
    };

    current.count += 1;
    current.confidence = Math.max(current.confidence, Number(detection.confidence) || 0);
    current.is_blacklisted = current.is_blacklisted || Boolean(detection.is_blacklisted);
    const timestamp = Number(detection.timestamp_seconds);
    if (Number.isFinite(timestamp)) {
      current.first_timestamp_seconds =
        typeof current.first_timestamp_seconds === "number"
          ? Math.min(current.first_timestamp_seconds, timestamp)
          : timestamp;
    }
    current.image_url = current.image_url || detection.image_url;
    current.detections.push(detection);
    byPlate.set(key, current);
  }

  return Array.from(byPlate.values()).sort(
    (a, b) => Number(b.is_blacklisted) - Number(a.is_blacklisted) || b.count - a.count
  );
};

export default function VideoRecognition() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [detections, setDetections] = useState([]);
  const [loadingDetections, setLoadingDetections] = useState(false);
  const [detectionError, setDetectionError] = useState("");
  const [playingVideo, setPlayingVideo] = useState(null);
  const [playbackDetections, setPlaybackDetections] = useState([]);
  const [activeTracks, setActiveTracks] = useState([]);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerLayout, setPlayerLayout] = useState({
    width: 0,
    height: 0,
    sourceWidth: 0,
    sourceHeight: 0,
  });
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [processingVideo, setProcessingVideo] = useState(null);
  const [selectedPlateSummary, setSelectedPlateSummary] = useState(null);

  const fileInputRef = useRef(null);
  const playingVideoRef = useRef(null);
  const playerStageRef = useRef(null);
  const playerVideoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const objectUrlRef = useRef(null);
  const scanTimerRef = useRef(null);
  const scanRunRef = useRef(0);
  const scanInFlightRef = useRef(false);
  const scanAbortRef = useRef(null);
  const scanSeqRef = useRef(0);
  const processingPollRef = useRef(null);
  const lastScannedTimeRef = useRef(Number.NEGATIVE_INFINITY);
  const liveDetectionSeqRef = useRef(0);
  const nextTrackIdRef = useRef(0);
  const activeTracksRef = useRef([]);

  const loadVideos = useCallback(async () => {
    try {
      const data = await videoApi.list();
      setVideos(data || []);
    } catch {
      // Keep realtime mode usable even if saved videos cannot be loaded.
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    playingVideoRef.current = playingVideo;
  }, [playingVideo]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) {
        window.clearInterval(scanTimerRef.current);
      }
      if (scanAbortRef.current) {
        scanAbortRef.current.abort();
      }
      if (processingPollRef.current) {
        window.clearInterval(processingPollRef.current);
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const revokeRealtimeUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const replaceActiveTracks = useCallback((tracks) => {
    activeTracksRef.current = tracks;
    setActiveTracks(tracks);
  }, []);

  const stopProcessingPoll = useCallback(() => {
    if (processingPollRef.current) {
      window.clearInterval(processingPollRef.current);
      processingPollRef.current = null;
    }
  }, []);

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
      if (video) setPlayerTime(video.currentTime || 0);
    };

    syncTime();
    const intervalId = window.setInterval(syncTime, 120);
    return () => window.clearInterval(intervalId);
  }, [playingVideo]);

  const stopRealtimeDetection = useCallback(() => {
    scanRunRef.current += 1;
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
      scanAbortRef.current = null;
    }
    scanInFlightRef.current = false;
    setScanning(false);
    setAnalyzing(false);
  }, []);

  const captureFrameForDetection = useCallback(async () => {
    const video = playerVideoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    const sourceWidth = video.videoWidth || 0;
    const sourceHeight = video.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(1, MAX_CAPTURE_WIDTH / sourceWidth);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", JPEG_CAPTURE_QUALITY);
    });

    if (!blob) return null;

    return {
      blob,
      width: targetWidth,
      height: targetHeight,
      timestamp: video.currentTime || 0,
    };
  }, []);

  const runRealtimeDetection = useCallback(
    async (runId) => {
      const video = playerVideoRef.current;
      const current = playingVideoRef.current;
      if (!current?.isRealtime || !video || video.paused || video.ended) return;
      if (scanInFlightRef.current) return;

      const playbackTime = video.currentTime || 0;
      if (playbackTime - lastScannedTimeRef.current < REALTIME_MIN_FRAME_DELTA_SECONDS) {
        return;
      }

      scanInFlightRef.current = true;
      setAnalyzing(true);

      try {
        const frame = await captureFrameForDetection();
        if (!frame || scanRunRef.current !== runId) return;
        lastScannedTimeRef.current = frame.timestamp;

        const file = new File([frame.blob], `video-frame-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        const scanSeq = scanSeqRef.current + 1;
        scanSeqRef.current = scanSeq;
        const shouldRunOcr = scanSeq % REALTIME_OCR_EVERY_N_SCANS === 0;
        const controller = new AbortController();
        scanAbortRef.current = controller;
        const data = await lprApi.recognizeRealtime(file, {
          ocr: shouldRunOcr,
          cacheCrops: true,
          maxPlates: REALTIME_MAX_PLATES,
          minConfidence: REALTIME_MIN_CONFIDENCE,
          signal: controller.signal,
        });
        if (scanRunRef.current !== runId) return;

        const responseTime = playerVideoRef.current?.currentTime ?? frame.timestamp;
        const plates = data?.success && Array.isArray(data.plates) ? data.plates : [];
        const mappedDetections = suppressDuplicateDetections(
          plates
            .map((plate) => {
              const bbox = normalizeBbox(plate.bbox);
              return {
                id: `live-${++liveDetectionSeqRef.current}`,
                uploaded_video_id: null,
                plate_number: plate.plate_number || "UNKNOWN",
                confidence: Number(plate.confidence) || 0,
                detect_confidence:
                  Number(plate.detect_confidence) || Number(plate.confidence) || 0,
                ocr_confidence: Number(plate.ocr_confidence) || 0,
                has_ocr: Boolean(plate.has_ocr),
                image_url: plate.crop_image_url || null,
                crop_cache_key: plate.crop_cache_key || null,
                frame_number: null,
                timestamp_seconds: responseTime,
                bbox,
                frame_width: frame.width,
                frame_height: frame.height,
                is_blacklisted: false,
                created_at: new Date().toISOString(),
              };
            })
            .filter((detection) => detection.bbox && isPlateLikeDetection(detection))
        );

        if (mappedDetections.length > 0) {
          const nextTracks = updateDetectionTracks(
            activeTracksRef.current,
            mappedDetections,
            responseTime,
            () => {
              nextTrackIdRef.current += 1;
              return nextTrackIdRef.current;
            }
          );
          replaceActiveTracks(nextTracks);
          setPlaybackDetections((prev) => [...mappedDetections, ...prev].slice(0, 80));
          const plateText = nextTracks
            .map((item) => item.plate_number)
            .filter((value) => value && value !== "UNKNOWN")
            .join(", ");
          setUploadMessage(
            plateText ? `Tracking: ${plateText}` : "Tracking plate region; OCR is running."
          );
        } else {
          replaceActiveTracks(pruneTracks(activeTracksRef.current, responseTime));
          setUploadMessage("Realtime detection is running.");
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        if (scanRunRef.current === runId) {
          setUploadMessage(error.message || "Realtime detection failed.");
        }
      } finally {
        if (scanRunRef.current === runId) {
          scanInFlightRef.current = false;
          scanAbortRef.current = null;
          setAnalyzing(false);
        }
      }
    },
    [captureFrameForDetection, replaceActiveTracks]
  );

  const startRealtimeDetection = useCallback(() => {
    const current = playingVideoRef.current;
    const video = playerVideoRef.current;
    if (!current?.isRealtime || !video || scanTimerRef.current) return;

    const runId = scanRunRef.current + 1;
    scanRunRef.current = runId;
    lastScannedTimeRef.current = Number.NEGATIVE_INFINITY;
    setScanning(true);
    runRealtimeDetection(runId);
    scanTimerRef.current = window.setInterval(
      () => runRealtimeDetection(runId),
      REALTIME_SCAN_INTERVAL_MS
    );
  }, [runRealtimeDetection]);

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

  const openProcessedVideo = useCallback(
    (detail) => {
      const processedUrl = detail.processed_video_url || detail.video_url;
      setPlayingVideo({
        id: detail.id,
        video_url: processedUrl,
        filename: detail.filename || "Untitled",
        isRealtime: false,
        isProcessed: Boolean(detail.processed_video_url),
      });
      setPlaybackDetections(detail.detections || []);
      replaceActiveTracks([]);
      setSelectedVideo(detail);
      setDetections(detail.detections || []);
      setDetectionError("");
      setSelectedPlateSummary(null);
      setPlayerTime(0);
      setPlayerLayout({ width: 0, height: 0, sourceWidth: 0, sourceHeight: 0 });
      window.setTimeout(updatePlayerLayout, 0);
    },
    [replaceActiveTracks, updatePlayerLayout]
  );

  const startProcessingPoll = useCallback(
    (videoId) => {
      stopProcessingPoll();

      const poll = async () => {
        try {
          const detail = await videoApi.detail(videoId);
          setProcessingVideo(detail);

          if (detail.status === "done") {
            stopProcessingPoll();
            setProcessingVideo(null);
            setUploadMessage("Detection complete. Opening processed video.");
            openProcessedVideo(detail);
            loadVideos();
          } else if (detail.status === "failed") {
            stopProcessingPoll();
            setProcessingVideo(null);
            setUploadMessage("Video detection failed. Check backend worker logs.");
            loadVideos();
          } else {
            setUploadMessage(
              `Processing video... ${detail.detections_count ?? 0} plate(s) cached.`
            );
          }
        } catch (error) {
          stopProcessingPoll();
          setProcessingVideo(null);
          setUploadMessage(error.message || "Failed to check video processing status.");
        }
      };

      poll();
      processingPollRef.current = window.setInterval(poll, 2500);
    },
    [loadVideos, openProcessedVideo, stopProcessingPoll]
  );

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

    stopRealtimeDetection();
    revokeRealtimeUrl();
    stopProcessingPoll();

    const fileToUpload = selectedFile;
    setUploadMessage("Uploading video...");
    setPlaybackDetections([]);
    replaceActiveTracks([]);
    setSelectedVideo(null);
    setDetections([]);
    setDetectionError("");
    setSelectedPlateSummary(null);
    setPlayerTime(0);
    setPlayerLayout({ width: 0, height: 0, sourceWidth: 0, sourceHeight: 0 });
    scanSeqRef.current = 0;
    liveDetectionSeqRef.current = 0;
    nextTrackIdRef.current = 0;

    try {
      const uploaded = await videoApi.upload(fileToUpload);
      setProcessingVideo(uploaded);
      setUploadMessage("Video uploaded. Queuing background detection...");
      await videoApi.queue(uploaded.id);
      setUploadMessage("Processing video in the background. Please wait...");
      startProcessingPoll(uploaded.id);
      loadVideos();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setProcessingVideo(null);
      setUploadMessage(error.message || "Video upload or queue failed.");
    }
  };

  const openVideoPlayer = async (video) => {
    stopRealtimeDetection();
    revokeRealtimeUrl();
    const detail = await videoApi.detail(video.id);
    openProcessedVideo(detail);
    return detail;
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
      setSelectedPlateSummary(null);
      if (dets.length === 0) {
        setDetectionError("No detections recorded for this video.");
      }
    } catch (error) {
      setDetectionError(error.message || "Failed to load detections.");
    } finally {
      setLoadingDetections(false);
    }
  };

  const handlePlayVideo = async (video) => {
    setPlayingVideo(null);
    if (video.status !== "done") {
      setUploadMessage("This video is not processed yet.");
      return;
    }
    try {
      await openVideoPlayer(video);
    } catch (error) {
      setUploadMessage("Failed to load video: " + (error.message || "Unknown error"));
    }
  };

  const handleClosePlayer = () => {
    stopRealtimeDetection();
    revokeRealtimeUrl();
    stopProcessingPoll();
    setPlayingVideo(null);
    setPlaybackDetections([]);
    replaceActiveTracks([]);
    setPlayerTime(0);
    setPlayerLayout({ width: 0, height: 0, sourceWidth: 0, sourceHeight: 0 });
    scanSeqRef.current = 0;
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadMessage("");
    setProcessingVideo(null);
    setSelectedPlateSummary(null);
    stopProcessingPoll();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const videoStatusBadge = (status) => {
    switch (status) {
      case "done":
        return <span className="status-badge success">Done</span>;
      case "processing":
        return <span className="status-badge warning">Processing</span>;
      case "failed":
        return <span className="status-badge error">Failed</span>;
      case "queued":
      case "ready":
      default:
        return <span className="status-badge info">Uploaded</span>;
    }
  };

  const visibleLiveTracks = activeTracks.filter((track) => {
    if (!isStableTrack(track)) return false;
    if (!hasOverlayMetadata(track)) return false;
    const timestamp = Number(track.lastSeen ?? track.timestamp_seconds);
    if (!Number.isFinite(timestamp)) return false;
    return playerTime >= timestamp - 0.2 && playerTime <= timestamp + TRACK_TTL_SECONDS;
  });

  const stableActiveTracks = activeTracks.filter(isStableTrack);
  const cachedPlateSummaries = useMemo(() => buildPlateSummaries(detections), [detections]);

  const activePlaybackDetections = playbackDetections.filter((detection) => {
    if (!hasOverlayMetadata(detection)) return false;
    const timestamp = getDetectionTimestamp(detection);
    if (timestamp === null) return false;
    return (
      playerTime >= timestamp - 0.15 &&
      playerTime <= timestamp + DETECTION_HOLD_SECONDS
    );
  });

  const overlayDetections = playingVideo?.isProcessed
    ? []
    : playingVideo?.isRealtime
      ? visibleLiveTracks
      : activePlaybackDetections;

  const overlayDetectionsCount = playingVideo?.isRealtime
    ? stableActiveTracks.length
    : playbackDetections.filter(hasOverlayMetadata).length;

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
    if (detection.plate_number && detection.plate_number !== "UNKNOWN") {
      return detection.plate_number;
    }
    const confidence = Number(detection.detect_confidence || detection.confidence) || 0;
    return `PLATE ${Math.round(confidence * 100)}%`;
  };

  return (
    <section className="dashboard-body">
      <div className="panel" style={{ minHeight: "auto" }}>
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Upload size={14} /> Background Video Detection
          </span>
          <span className="subtle">upload, wait, then review processed result</span>
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
                : "Choose a video file"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn-cool"
              type="submit"
              disabled={!selectedFile || Boolean(processingVideo)}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <ScanLine size={16} /> Upload & Detect
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
        {processingVideo && (
          <div className="lpr-player-strip">
            <span>Processing: {processingVideo.filename || "Uploaded video"}</span>
            <span>{processingVideo.status || "queued"}</span>
            <span>{processingVideo.detections_count ?? 0} cached plate(s)</span>
          </div>
        )}
      </div>

      {playingVideo && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Play size={14} /> Now Playing - {playingVideo.filename}
            </span>
            <div className="lpr-player-actions">
              <span className="subtle">
                {playingVideo.isRealtime
                  ? scanning
                    ? analyzing
                      ? "Detecting"
                      : "Realtime"
                    : "Paused"
                  : playingVideo.isProcessed
                    ? "Processed result"
                  : `${overlayDetectionsCount} boxed frame(s)`}
              </span>
              {playingVideo.isRealtime && scanning && (
                <button
                  className="btn btn-sm"
                  onClick={stopRealtimeDetection}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#eef3ff",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Square size={13} /> Stop Detect
                </button>
              )}
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
                controls={false}
                autoPlay
                muted
                playsInline
                onLoadedMetadata={(event) => {
                  setVideoDuration(event.currentTarget.duration || 0);
                  updatePlayerLayout();
                }}
                onLoadedData={updatePlayerLayout}
                onPlay={() => {
                  setIsPlaying(true);
                  startRealtimeDetection();
                }}
                onPause={() => {
                  setIsPlaying(false);
                  stopRealtimeDetection();
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  stopRealtimeDetection();
                }}
                onTimeUpdate={(event) => setPlayerTime(event.currentTarget.currentTime || 0)}
                onSeeking={(event) => {
                  // Prevent seeking by resetting to current time
                  event.preventDefault();
                  event.currentTarget.currentTime = playerTime;
                }}
              >
                Your browser does not support the video tag.
              </video>
              <canvas ref={captureCanvasRef} style={{ display: "none" }} />
              <div className="lpr-video-overlay" aria-hidden="true">
                {overlayDetections.map((detection) => (
                  <div
                    key={`${detection.id ?? "live"}-${detection.timestamp_seconds ?? "time"}`}
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
            <span>{playerTime.toFixed(1)}s / {videoDuration.toFixed(1)}s</span>
            <span>{overlayDetections.length} active</span>
            <span>
              {playingVideo.isRealtime
                ? `${stableActiveTracks.length} tracked plate(s)`
                : `${playbackDetections.length} detection event(s)`}
            </span>
          </div>
          {/* Custom playback controls - no seek allowed */}
          <div className="lpr-player-controls">
            <button
              className="btn btn-sm"
              onClick={() => {
                const video = playerVideoRef.current;
                if (!video) return;
                if (video.paused || video.ended) {
                  video.play();
                } else {
                  video.pause();
                }
              }}
              style={{
                background: isPlaying ? "rgba(255,60,60,0.2)" : "rgba(42,209,255,0.2)",
                color: isPlaying ? "#ff6b6b" : "#2ad1ff",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <div className="lpr-progress-bar">
              <div
                className="lpr-progress-fill"
                style={{
                  width: videoDuration > 0 ? `${(playerTime / videoDuration) * 100}%` : "0%"
                }}
              />
            </div>
            <span className="lpr-live-badge">
              {playingVideo.isProcessed ? "PROCESSED" : "LIVE"}
            </span>
          </div>
        </div>
      )}

      {playingVideo?.isRealtime && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Eye size={14} /> Realtime Results
            </span>
            <span className="subtle">{stableActiveTracks.length} tracked plate(s)</span>
          </div>

          {stableActiveTracks.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Crop</th>
                    <th>Plate Number</th>
                    <th>Confidence</th>
                    <th>Timestamp</th>
                    <th>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {stableActiveTracks.map((det) => (
                    <tr key={det.id}>
                      <td>
                        {det.image_url ? (
                          <img
                            className="lpr-realtime-crop"
                            src={det.image_url}
                            alt={det.plate_number || "Plate crop"}
                          />
                        ) : (
                          <span style={{ color: "var(--muted)" }}>-</span>
                        )}
                      </td>
                      <td>
                        <strong>
                          {det.plate_number && det.plate_number !== "UNKNOWN"
                            ? det.plate_number
                            : "Reading..."}
                        </strong>
                        {Number(det.ocr_confidence) > 0 && (
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                            OCR {Math.round(det.ocr_confidence * 100)}%
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="status-badge info">
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>
                        {typeof det.timestamp_seconds === "number"
                          ? `${det.timestamp_seconds.toFixed(1)}s`
                          : "-"}
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
                <ScanLine size={32} />
              </div>
              <span>No plate detected yet.</span>
            </div>
          )}
        </div>
      )}

      <div className="panel" style={{ minHeight: "auto" }}>
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Video size={14} /> Saved Videos
          </span>
          <span className="subtle">{videos.length} video(s)</span>
        </div>

        {videos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Video size={32} />
            </div>
            <span>No saved videos yet.</span>
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
                          disabled={video.status !== "done"}
                          title={video.status === "done" ? "Play processed video" : "Wait for processing"}
                          style={{
                            background: "rgba(42,209,255,0.15)",
                            color: "#2ad1ff",
                            opacity: video.status === "done" ? 1 : 0.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Play size={14} /> Play
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedVideo && (
        <div className="panel" style={{ minHeight: "auto" }}>
          <div className="panel-head">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Eye size={14} /> Detections - {selectedVideo.filename || "Untitled"}
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
            <>
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cached Plate</th>
                      <th>Best Confidence</th>
                      <th>Events</th>
                      <th>First Seen</th>
                      <th>Blacklist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cachedPlateSummaries.map((summary) => (
                      <tr
                        key={normalizePlateKey(summary.plate_number)}
                        className={
                          selectedPlateSummary?.plate_number === summary.plate_number
                            ? "row-selected"
                            : ""
                        }
                        onClick={() => setSelectedPlateSummary(summary)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <strong>{summary.plate_number}</strong>
                        </td>
                        <td>
                          <span className="status-badge info">
                            {Math.round(summary.confidence * 100)}%
                          </span>
                        </td>
                        <td>{summary.count}</td>
                        <td style={{ fontSize: 12, color: "var(--muted)" }}>
                          {typeof summary.first_timestamp_seconds === "number"
                            ? `${summary.first_timestamp_seconds.toFixed(1)}s`
                            : "-"}
                        </td>
                        <td>
                          {summary.is_blacklisted ? (
                            <span className="status-badge error">Blacklisted</span>
                          ) : (
                            <span className="status-badge success">Clear</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedPlateSummary && (
                <div
                  className="empty-state"
                  style={{
                    alignItems: "flex-start",
                    color: selectedPlateSummary.is_blacklisted ? "#ff6b6b" : "var(--text)",
                    marginBottom: 14,
                  }}
                >
                  <AlertCircle size={22} />
                  <span>
                    Plate <strong>{selectedPlateSummary.plate_number}</strong>{" "}
                    {selectedPlateSummary.is_blacklisted
                      ? "is in the blacklist."
                      : "is not in the blacklist."}
                  </span>
                </div>
              )}

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
            </>
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
