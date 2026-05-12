import { useRef, useState } from "react";
import { lprApi } from "../api/client";
import { ScanLine, Upload, Trash2, CheckCircle, XCircle } from "lucide-react";

export default function LicensePlateRecognition() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
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

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setMessage("");

    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    setResult(null);
  };

  const handleRecognize = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setMessage("Please choose an image of a license plate first.");
      return;
    }

    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const data = await lprApi.recognize(selectedFile);
      setResult(data);

      if (data.success && data.plates && data.plates.length > 0) {
        const plateTexts = data.plates.map((p) => p.plate_number).filter(Boolean);
        if (plateTexts.length > 0) {
          setMessage(`Recognized: ${plateTexts.join(", ")}`);
        } else {
          setMessage("Plates detected but text not recognized.");
        }
      } else {
        setMessage(data.error || "Could not recognize license plate.");
      }
    } catch (error) {
      setMessage(error.message || "Recognition failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <section className="dashboard-body">
      <div className="panel lpr-panel">
        <div className="panel-head">
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ScanLine size={14} /> License Plate Recognition
          </span>
          <span className="subtle">Supports multi-line & multiple plates</span>
        </div>

        <form className="upload-form" onSubmit={handleRecognize}>
          <div className="upload-field">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            <div className="upload-meta">
              {selectedFile
                ? `${selectedFile.name} - ${formatBytes(selectedFile.size)}`
                : "Choose a license plate image"}
            </div>
          </div>
          <div className="lpr-btn-group">
            <button
              className="btn btn-cool"
              type="submit"
              disabled={loading || !selectedFile}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <ScanLine size={16} /> {loading ? "Recognizing..." : "Recognize"}
            </button>
            {result && (
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
                <Trash2 size={14} /> Clear
              </button>
            )}
          </div>
        </form>

        <div className="lpr-content">
          {previewUrl && (
            <div className="lpr-image-wrap">
              <img
                src={previewUrl}
                alt="License plate"
                className="lpr-image"
              />
            </div>
          )}

          {result && (
            <div className="lpr-results-list">
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
                      {plate.bbox && (
                        <div className="lpr-bbox">
                          BBox: [{plate.bbox.map((v) => Math.round(v)).join(", ")}]
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="lpr-result error">
                  <div className="lpr-result-icon">
                    <XCircle size={24} />
                  </div>
                  <div className="lpr-result-body">
                    <div className="lpr-error-text">
                      {result.error || "No plate detected"}
                    </div>
                  </div>
                </div>
              )}
              {result.success && result.plates && result.plates.length > 1 && (
                <div className="lpr-plates-count">
                  Total: {result.plates_count || result.plates.length} plate(s) detected
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`message ${message ? "" : "muted"}`}>
          {message || " "}
        </div>
      </div>
    </section>
  );
}