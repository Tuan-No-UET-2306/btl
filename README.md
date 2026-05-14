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
├── docker-compose.yml    # PostgreSQL + Redis + MinIO services
├── requirement.txt       # Python dependencies
├── README.md
```

## 🧩 Yêu cầu hệ thống

- Python ≥ 3.10
- Node.js
- Docker Desktop (cho PostgreSQL + Redis + MinIO)
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

### 1.3. Khởi động PostgreSQL + Redis + MinIO (Docker)

```bash
docker-compose up -d postgres redis minio
```

Kiểm tra containers đã chạy:
```bash
docker ps
```

Bạn có thể truy cập MinIO Console tại: http://localhost:9001  
- User: `minioadmin`
- Password: `minioadmin`

### 1.4. Chạy Backend

```bash
uvicorn src.backend.main:app --reload
```

Server sẽ chạy tại: **http://localhost:8000**

API docs (Swagger UI): **http://localhost:8000/docs**

### 1.5. Chạy Celery worker xử lý video

Mở một terminal riêng, dùng cùng Python environment với backend:

```bash
celery -A src.backend.tasks.celery_app:celery_app worker -Q video_processing --loglevel=info
```

Backend sẽ đẩy job xử lý video vào Redis queue. Celery worker lấy job từ queue và gửi realtime event về API qua Redis pub/sub để WebSocket vẫn nhận frame/progress.

> **Lưu ý:** Khi chạy lần đầu, server sẽ tự động:
> - Tạo các bảng trong PostgreSQL
> - Fix schema cũ (thêm các column còn thiếu)
> - Tạo bucket trong MinIO
> - Load YOLOv5 detection model + OCR model từ `src/models/`

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
| `/history` | Lịch sử các detection đã thực hiện |

### 3.4. Sử dụng LPR Recognition

1. Vào menu **"LPR Recognition"** (sidebar)
2. Click "Choose file" hoặc kéo-thả ảnh xe có biển số
3. Click **"Recognize"**
4. Chờ kết quả:
   - ✅ **Thành công:** Hiển thị biển số + confidence score
   - ❌ **Thất bại:** Hiển thị thông báo lỗi

### 3.5. Realtime video detection

1. Vào `/dashboard`
2. Upload video hoặc GIF
3. Backend sẽ xử lý từng frame bằng hai model ONNX và gửi frame đã vẽ bbox qua WebSocket
4. Kết quả detection được lưu vào `video_detections`

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
| `LP_detector_nano_61.pt` | YOLOv5 detector — phát hiện vùng biển số trên ảnh |
| `LP_ocr_nano_62.pt` | YOLOv5 OCR — nhận diện ký tự từ vùng biển số đã crop |
| `LP_detector_nano_61.onnx` | ONNX Runtime detector dùng khi chạy backend |
| `LP_ocr_nano_62.onnx` | ONNX Runtime OCR dùng khi chạy backend |

> **Lưu ý:** Các model này được train riêng cho bài toán nhận diện biển số, không phải model COCO mặc định.

### Chuyển `.pt` sang ONNX

Chuyển cả hai model LPR mặc định:

```bash
python scripts/pt_to_onnx.py
```

Chuyển một file `.pt` bất kỳ:

```bash
python scripts/pt_to_onnx.py --weights src/models/LP_detector_nano_61.pt --imgsz 640 640
```

File `.onnx` sẽ được tạo cùng thư mục với file `.pt`.

Backend mặc định dùng hai file ONNX này. Có thể đổi đường dẫn bằng:

```bash
LPR_DETECTOR_MODEL_PATH=src/models/LP_detector_nano_61.onnx
LPR_OCR_MODEL_PATH=src/models/LP_ocr_nano_62.onnx
```

---

## 🐳 6. Docker Compose Services

| Service | Port | Mô tả |
|---------|------|-------|
| PostgreSQL | `5432` (host) → `5432` (container) | Database |
| Redis | `6379` | Celery broker/result backend + realtime event bus |
| MinIO | `9000` (API) + `9001` (Console) | Object storage |

Khi chạy backend trực tiếp trên máy host, `DATABASE_URL` phải dùng port host `5432`, ví dụ:

```bash
DATABASE_URL=postgresql+psycopg2://postgres:khongmk@localhost:5432/postgres
```
