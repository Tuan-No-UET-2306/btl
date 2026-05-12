import { useCallback, useEffect, useRef, useState } from "react";
import { lprApi } from "../api/client";
import { Camera, CameraOff, ScanLine, Play, Square, AlertCircle, CheckCircle, XCircle } from "lucide-react";

export default function WebcamRecognition() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const autoTimerRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [interval, setInterval] = useState(3000);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoMode(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    setMessage("Opening camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setMessage("");
    } catch (err) {
      setError("Cannot access camera: " + (err.message || "Permission denied"));
      setMessage("");
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    });
  }, []);

  const handleCapture = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    setMessage("Recognizing...");

    try {
      const blob = await captureFrame();
      if (!blob) {
        setMessage("Failed to capture frame.");
        return;
      }
      const file = new File([blob], "webcam.jpg", { type: "image/jpeg" });
      const data = await lprApi.recognize(file);
      setResult(data);

      if (data.success && data.plates && data.plates.length > 0) {
        const plateTexts = data.plates.map((p) => p.plate_number).filter(Boolean);
        setMessage(plateTexts.length > 0 ? `Recognized: ${plateTexts.join(", ")}` : "Plates detected but text not recognized.");
      } else {
        setMessage(data.error || "No license plate detected.");
      }
    } catch (err) {
      setMessage(err.message || "Recognition failed.");
    } finally {
      setLoading(false);
    }
  }, [loading, captureFrame]);

  const toggleAutoMode = () => {
    if (autoMode) {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      setAutoMode(false);
    } else {
      setAutoMode(true);
      handleCapture();
      autoTimerRef.current = setInterval(() => {
        handleCapture();
      }, interval);
    }
  };

  return (
    <section className="dashboard-body">
      <div className="panel" style={{ minHeight: "auto" }}>
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Camera size={14} /> Webcam Recognition
          </span>
          <span className="subtle">Real-time LPR from laptop camera</span>
        </div>

        {/* Controls */}
        <div className="webcam-controls">
          {!cameraOn ? (
            <button className="btn btn-cool" onClick={startCamera} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Camera size={16} /> Open Camera
            </button>
          ) : (
            <>
              <button className="btn btn-cool" onClick={handleCapture} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ScanLine size={16} /> {loading ? "Recognizing..." : "Capture & Recognize"}
              </button>
              <button
                className={`btn ${autoMode ? "btn-primary" : ""}`}
                onClick={toggleAutoMode}
                disabled={loading}
                style={autoMode ? { display: "flex", alignItems: "center", gap: 6 } : { background: "rgba(255,255,255,0.08)", color: "#eef3ff", display: "flex", alignItems: "center", gap: 6 }}
              >
                {autoMode ? <Square size={14} /> : <Play size={14} />}
                {autoMode ? "Stop Auto" : "Auto Capture"}
              </button>
              {autoMode && (
                <span className="webcam-interval">
                  Interval:
                  <select value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
                    <option value={1000}>1s</option>
                    <option value={2000}>2s</option>
                    <option value={3000}>3s</option>
                    <option value={5000}>5s</option>
                  </select>
                </span>
              )}
              <button
                className="btn"
                onClick={stopCamera}
                style={{ background: "rgba(255,60,60,0.2)", color: "#ff6b6b", display: "flex", alignItems: "center", gap: 6 }}
              >
                <CameraOff size={16} /> Close Camera
              </button>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="empty-state" style={{ color: "#ff6b6b" }}>
            <AlertCircle size={24} />
            <span>{error}</span>
          </div>
        )}

        {/* Video + Canvas */}
        <div className="webcam-view">
          <video
            ref={videoRef}
            className="webcam-video"
            playsInline
            muted
            style={{ display: cameraOn ? "block" : "none" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {!cameraOn && !error && (
            <div className="webcam-placeholder">
              <div className="webcam-placeholder-icon">
                <Camera size={48} />
              </div>
              <div>Click "Open Camera" to start</div>
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="lpr-results-list" style={{ marginTop: 16 }}>
            {result.success && result.plates && result.plates.length > 0 ? (
              result.plates.map((plate, idx) => (
                <div key={idx} className="lpr-result success">
                  <div className="lpr-result-icon">
                    <CheckCircle size={24} />
                  </div>
                  <div className="lpr-result-body">
                    <div className="lpr-plate-number">{plate.plate_number}</div>
                    <div className="lpr-confidence">
                      Detection: {Math.round((plate.detect_confidence || 0) * 100)}% &middot;
                      OCR: {Math.round((plate.ocr_confidence || 0) * 100)}% &middot;
                      Overall: {Math.round(plate.confidence * 100)}%
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="lpr-result error">
                <div className="lpr-result-icon">
                  <XCircle size={24} />
                </div>
                <div className="lpr-result-body">
                  <div className="lpr-error-text">{result.error || "No plate detected"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`message ${message ? "" : "muted"}`}>
          {message || " "}
        </div>
      </div>
    </section>
  );
}