# 🚗 LPR System — License Plate Recognition

Hệ thống nhận diện biển số xe sử dụng **YOLOv5** (detection + OCR) kết hợp với **FastAPI** (backend) và **React + Vite** (frontend).

## 📁 Cấu trúc thư mục

```
btl/
├── src/
│   ├── backend/          # FastAPI backend
│   ├── frontend/         # React + Vite frontend
│   ├── models/           # Pre-trained models (.pt)
│   └── yolov5/           # YOLOv5 source code
├── docker-compose.yml    # MinIO + Redis services, optional local PostgreSQL
├── requirement.txt       # Python dependencies
├── README.md
```

## 🧩 Yêu cầu hệ thống

- Python ≥ 3.10
- Node.js
- Docker Desktop (cho MinIO + Redis)
- Git

---

## 🖥️ 1. Cài đặt Backend

### 1.1. Tạo môi trường conda (khuyên dùng)

```bash
conda create -n conda_env python=3.10 -y
conda activate conda_env
```

### 1.2. Cài Python dependencies

```bash
pip install -r requirement.txt
```

> **Lưu ý:** Nếu gặp lỗi `bcrypt` hoặc `psycopg2`, hãy cài riêng:
> ```bash
> pip install bcrypt<4 psycopg2-binary
> ```

### 1.3. Cấu hình database Supabase dùng chung

Copy file môi trường mẫu:

```bash
cp .env.example .env
```

Mở file `.env` và thay `DATABASE_URL` bằng connection string Supabase của nhóm:

```env
DATABASE_URL=postgresql://postgres:YOUR_SUPABASE_PASSWORD@db.vyfyqfpsmpjuqieuzlab.supabase.co:5432/postgres?sslmode=require
```

File `.env` là cấu hình riêng của từng máy và không được commit lên Git.

### 1.4. Khởi động MinIO + Redis (Docker)

```bash
docker-compose up -d minio redis
```

Kiểm tra containers đã chạy:
```bash
docker ps
```

Bạn có thể truy cập MinIO Console tại: http://localhost:9001  
- User: `minioadmin`
- Password: `minioadmin`

Redis được dùng làm Celery broker/result backend và pub/sub realtime cho WebSocket.

Nếu cần chạy PostgreSQL local để test riêng, dùng:

```bash
docker-compose --profile local-db up -d postgres
```

### 1.5. Cấu hình model local

```bash
export VIDEO_DETECT_MODEL_PATH="src/models/LP_detector_nano_61.onnx"
export VIDEO_OCR_MODEL_PATH="src/models/LP_ocr_nano_62.onnx"
```

Trên Windows PowerShell:

```powershell
$env:VIDEO_DETECT_MODEL_PATH="src/models/LP_detector_nano_61.onnx"
$env:VIDEO_OCR_MODEL_PATH="src/models/LP_ocr_nano_62.onnx"
```

### 1.6. Chạy Backend

```bash
uvicorn src.backend.main:app --reload
```

Server sẽ chạy tại: **http://localhost:8000**

API docs (Swagger UI): **http://localhost:8000/docs**

> **Lưu ý:** Khi chạy lần đầu, server sẽ tự động:
> - Kết nối tới database Supabase trong `DATABASE_URL`
> - Tạo các bảng còn thiếu trong PostgreSQL
> - Fix schema cũ (thêm các column còn thiếu)
> - Tạo bucket trong MinIO
> - Load YOLOv5 detection model + OCR model từ `src/models/`

### 1.7. Chạy Celery worker xử lý video

Mở terminal thứ hai, cùng môi trường Python:

```bash
celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info
```

Video upload sẽ được đưa vào Redis queue. Worker lấy từng video, dùng model local `LP_detector_nano_61.onnx` để detect biển số theo frame, lưu detection vào database và đẩy progress realtime qua WebSocket.

---

## 🎨 2. Cài đặt Frontend

### 2.1. Cài dependencies

```bash
cd src/frontend
npm install
```

### 2.2. Chạy Frontend

```bash
npm run dev
```

Frontend sẽ chạy tại: **http://localhost:5173**

> **Lưu ý:** Nếu backend chạy ở port khác `8000`, set biến môi trường:
> ```powershell
> $env:VITE_API_BASE="http://localhost:8000"
> ```
> Hoặc tạo file `.env` trong `src/frontend/`:
> ```
> VITE_API_BASE=http://localhost:8000
> ```

---

## 🚀 3. Hướng dẫn sử dụng

### 3.1. Truy cập ứng dụng

Mở trình duyệt: **http://localhost:5173**

### 3.2. Đăng ký / Đăng nhập

1. Click **"Create an account"** để đăng ký user mới
2. Nhập username + password → **"Create account"**
3. Đăng nhập với thông tin vừa tạo

### 3.3. Chức năng chính

| Route | Chức năng |
|-------|-----------|
| `/dashboard` | Dashboard tổng quan, upload video |
| `/lpr` | **LPR Recognition** — Upload ảnh xe → detect + nhận diện biển số |
| `/video` | **Video Detection** — chạy realtime detection trên video |
| `/history` | Lịch sử các detection đã thực hiện |

### 3.4. Sử dụng LPR Recognition

1. Vào menu **"LPR Recognition"** (sidebar)
2. Click "Choose file" hoặc kéo-thả ảnh xe có biển số
3. Click **"Recognize"**
4. Chờ kết quả:
   - ✅ **Thành công:** Hiển thị biển số + confidence score
   - ❌ **Thất bại:** Hiển thị thông báo lỗi

### 3.5. Detect video bằng model local

Nếu chỉ muốn chạy giống demo detection trên video và xuất ra file đã vẽ bbox:

```bash
python scripts/detect_video.py --source path/to/video.mp4
```

Mặc định script dùng model detector local:

```bash
src/models/LP_detector_nano_61.onnx
```

Đổi model của bạn bằng `--weights`:

```bash
python scripts/detect_video.py \
  --source path/to/video.mp4 \
  --weights src/models/LP_detector_nano_61.pt \
  --output runs/detect_video/output.avi \
  --conf 0.35 \
  --imgsz 640
```

Chạy webcam:

```bash
python scripts/detect_video.py --source 0 --view
```

Output mặc định nằm trong `runs/detect_video/` ở dạng `.avi` dùng codec MJPG, thường dễ mở hơn file `.mp4` tạo trực tiếp từ OpenCV.
Nếu muốn mở trực tiếp bằng Chrome, xuất `.webm`:

```bash
python scripts/detect_video.py \
  --source path/to/video.mp4 \
  --output runs/detect_video/output.webm
```

---

## 🛠️ 4. API Endpoints

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| POST | `/api/v1/auth/register` | Đăng ký | ❌ |
| POST | `/api/v1/auth/login` | Đăng nhập | ❌ |
| GET | `/api/v1/auth/me` | Thông tin user | ✅ |
| POST | `/api/v1/lpr/recognize` | Nhận diện biển số từ ảnh | ✅ |
| GET | `/api/v1/detections` | Danh sách detection history | ✅ |
| POST | `/api/v1/detections/upload` | Upload ảnh + YOLOv5 detection | ✅ |
| POST | `/api/v1/videos/` | Upload video | ✅ |
| GET | `/api/v1/videos/` | Danh sách video | ✅ |
| POST | `/api/v1/videos/{video_id}/queue` | Đưa video vào Redis/Celery queue | ✅ |
| GET | `/api/v1/videos/{video_id}/detections` | Danh sách detection của video | ✅ |
| WS | `/api/v1/ws/stream` | Event realtime cho video processing | ❌ |

### Test API với curl

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# LPR Recognition (thay <token> bằng token nhận được)
curl -X POST http://localhost:8000/api/v1/lpr/recognize \
  -H "Authorization: Bearer <token>" \
  -F "file=@path/to/car_image.jpg"
```

---


## 🧠 5. Models

Các model pre-trained được đặt tại `src/models/`:

| File | Mô tả |
|------|-------|
| `LP_detector_nano_61.onnx` | YOLOv5 detector — phát hiện vùng biển số |
| `LP_ocr_nano_62.onnx` | YOLOv5 OCR — nhận diện ký tự từ vùng biển số đã crop |

> **Lưu ý:** Cả ảnh, video realtime và worker xử lý video đều dùng detector local `src/models/LP_detector_nano_61.onnx`.

---

## 🐳 6. Docker Compose Services

| Service | Port | Mô tả |
|---------|------|-------|
| PostgreSQL | `5433` (host) → `5432` (container) | Optional local database, chỉ chạy khi bật profile `local-db` |
| MinIO | `9000` (API) + `9001` (Console) | Object storage |
| Redis | `6379` | Queue Celery + realtime pub/sub |
