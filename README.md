# LPR System

Hệ thống nhận diện biển số xe, quản lý lịch sử nhận diện và hỗ trợ nghiệp vụ giao thông. Dự án gồm frontend React, backend FastAPI, model YOLOv5/OCR, xử lý video bằng Celery, lưu trữ file bằng MinIO và monitoring bằng Prometheus/Grafana.

Website đã triển khai:

```text
https://lprtuannoiuemwork.tech/
```

<p align="center">
  <img src="./results/dashboard_user.png" alt="LPR System Dashboard" width="900">
</p>

## Chức năng chính

- Đăng ký, đăng nhập và phân quyền `user` / `admin`.
- Dashboard thống kê lượt nhận diện, video, blacklist và hoạt động gần đây.
- Nhận diện biển số từ ảnh upload.
- Nhận diện biển số realtime từ webcam.
- Upload video, xử lý biển số theo frame và xuất video đã vẽ bounding box.
- Lưu lịch sử nhận diện, tìm kiếm, lọc và export CSV.
- Quản lý blacklist biển số.
- Tra cứu phương tiện, vi phạm, điểm trừ và trạng thái blacklist.
- Gửi và xử lý khiếu nại vi phạm.
- Quản trị người dùng cho tài khoản admin.
- Theo dõi hệ thống bằng metrics, logs, Prometheus và Grafana.

## Hình ảnh giao diện

| Đăng nhập | Dashboard |
|---|---|
| <img src="./results/dangnhap.png" alt="Login" width="420"> | <img src="./results/dashboard_user.png" alt="Dashboard" width="420"> |

| Nhận diện ảnh | Nhận diện video |
|---|---|
| <img src="./results/image_detect.png" alt="Image detection" width="420"> | <img src="./results/video_detect.png" alt="Video detection" width="420"> |

| Webcam | Lịch sử |
|---|---|
| <img src="./results/webcam_detect.png" alt="Webcam detection" width="420"> | <img src="./results/history.png" alt="History" width="420"> |

| Tra cứu giao thông | Blacklist |
|---|---|
| <img src="./results/traffic.png" alt="Traffic lookup" width="420"> | <img src="./results/blacklist.png" alt="Blacklist" width="420"> |

| Khiếu nại |
|---|
| <img src="./results/complaints.png" alt="Complaints" width="860"> |

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 18, Vite, React Router, Tailwind CSS, DaisyUI, Lucide React |
| Backend | Python 3.10, FastAPI, Uvicorn, SQLAlchemy, Pydantic |
| AI / Computer Vision | YOLOv5, PyTorch, ONNX, ONNXRuntime, OpenCV |
| Database | PostgreSQL / Supabase |
| Object storage | MinIO |
| Background jobs | Celery, Redis |
| Realtime | WebSocket, Redis pub/sub |
| Monitoring | Prometheus, Grafana, structured JSON logs |
| Deploy | Docker, Docker Compose, Nginx, GitHub Actions |

## Kiến trúc tổng quan

```text
Browser
  |
  v
Nginx / HTTPS
  |
  +-- React Frontend
  +-- FastAPI Backend
        |
        +-- PostgreSQL / Supabase
        +-- MinIO
        +-- Redis
        +-- Celery Worker
        +-- YOLOv5 Detector + OCR Models
```

API backend dùng prefix:

```text
/api/v1
```

WebSocket:

```text
/api/v1/ws/stream
/api/v1/ws/videos/{video_id}
```

## Cấu trúc thư mục

```text
btl/
├── README.md
├── DEPLOYMENT_GUIDE.md
├── MONITORING.md
├── docker-compose.prod.yml
├── requirement.txt
├── results/                 # Ảnh giao diện demo
├── deploy/
│   ├── docker/              # Dockerfile backend/frontend
│   ├── nginx/               # Reverse proxy config
│   ├── prometheus/          # Prometheus config + alert rules
│   └── grafana/             # Grafana datasource + dashboard
└── src/
    ├── backend/             # FastAPI backend
    ├── frontend/            # React + Vite frontend
    ├── models/              # Model detector/OCR
    └── yolov5/              # YOLOv5 source
```

## Model sử dụng

Các model chính nằm trong `src/models/`:

```text
LP_detector_nano_61.onnx
LP_detector_nano_61.pt
LP_ocr_nano_62.onnx
LP_ocr_nano_62.pt
```

Backend load model qua source YOLOv5 local tại `src/yolov5`.

## Cài đặt nhanh bằng Docker Compose

Tạo file môi trường:

```bash
cp .env.example .env
```

Cập nhật tối thiểu các biến sau trong `.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET_KEY=replace-with-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password

DOCKER_PUBLIC_APP_URL=http://localhost:8080
DOCKER_CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
DOCKER_MINIO_PUBLIC_URL=http://localhost:8080/files
```

Chạy toàn bộ hệ thống:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Các URL local:

| Dịch vụ | URL |
|---|---|
| Web app | `http://localhost:8080` |
| MinIO Console | `http://localhost:9001` |
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3000` |

Dừng hệ thống:

```bash
docker compose -f docker-compose.prod.yml down
```

## Chạy local cho phát triển

### Backend

```bash
python3.10 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirement.txt
uvicorn src.backend.main:app --reload --host 0.0.0.0 --port 8000
```

Backend chạy tại:

```text
http://localhost:8000
```

Swagger UI:

```text
http://localhost:8000/docs
```

### Redis và MinIO

Redis:

```bash
docker run -d --name lpr-redis-dev -p 6379:6379 redis:7
```

MinIO:

```bash
docker run -d \
  --name lpr-minio-dev \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

### Celery worker

Worker dùng để xử lý video bất đồng bộ:

```bash
celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info
```

### Frontend

```bash
cd src/frontend
npm install
npm run dev
```

Frontend chạy tại:

```text
http://localhost:5173
```

Nếu backend không chạy ở `http://localhost:8000`, tạo file `src/frontend/.env.local`:

```env
VITE_API_BASE=http://localhost:8000
```

## Biến môi trường quan trọng

| Biến | Mô tả |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL/Supabase |
| `JWT_SECRET_KEY` | Secret ký JWT |
| `CORS_ORIGINS` | Danh sách origin frontend được phép gọi API |
| `MINIO_ENDPOINT` | Endpoint MinIO |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `MINIO_BUCKET` | Bucket lưu ảnh/video |
| `CELERY_BROKER_URL` | Redis broker cho Celery |
| `CELERY_BACKEND_URL` | Redis result backend cho Celery |
| `REDIS_URL` | Redis dùng cho realtime events |
| `VIDEO_DETECT_MODEL_PATH` | Đường dẫn model detector |
| `VIDEO_OCR_MODEL_PATH` | Đường dẫn model OCR |
| `VITE_API_BASE` | Base URL API cho frontend |

Ví dụ production cho domain hiện tại:

```env
CORS_ORIGINS=https://lprtuannoiuemwork.tech
DOCKER_PUBLIC_APP_URL=https://lprtuannoiuemwork.tech
DOCKER_CORS_ORIGINS=https://lprtuannoiuemwork.tech
DOCKER_MINIO_PUBLIC_URL=https://lprtuannoiuemwork.tech/files
```

## API tiêu biểu

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Đăng ký |
| `POST` | `/api/v1/auth/login` | Đăng nhập |
| `GET` | `/api/v1/auth/me` | Thông tin user hiện tại |
| `POST` | `/api/v1/lpr/recognize` | Nhận diện biển số từ ảnh |
| `POST` | `/api/v1/lpr/realtime-frame` | Nhận diện frame realtime |
| `GET` | `/api/v1/detections/search` | Tìm kiếm lịch sử nhận diện |
| `GET` | `/api/v1/detections/export` | Export lịch sử CSV |
| `POST` | `/api/v1/videos/` | Upload video |
| `POST` | `/api/v1/videos/{video_id}/queue` | Queue xử lý video |
| `GET` | `/api/v1/videos/{video_id}/detections` | Kết quả nhận diện video |
| `GET` | `/api/v1/blacklist/` | Danh sách blacklist |
| `GET` | `/api/v1/traffic/lookup/{plate_number}` | Tra cứu biển số |
| `POST` | `/api/v1/traffic/complaints` | Gửi khiếu nại |
| `GET` | `/api/v1/users` | Quản lý user, admin only |

Ví dụ nhận diện ảnh:

```bash
curl -X POST "http://localhost:8000/api/v1/lpr/recognize" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./sample.jpg"
```

## Monitoring

Backend expose metrics tại:

```text
/metrics
```

Khi chạy Docker Compose:

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`

Dashboard Grafana được cấu hình sẵn trong:

```text
deploy/grafana/dashboards/lpr_dashboard.json
```

## Kiểm thử

Backend:

```bash
pytest src/backend/tests -q --ignore=src/backend/tests/test_video_ocr.py
```

Frontend:

```bash
cd src/frontend
npm ci
npm run build
```

## CI/CD

Workflow nằm tại:

```text
.github/workflows/ci-cd.yml
```

Pipeline hiện có:

- Chạy backend tests.
- Build frontend.
- Build và push Docker images lên GHCR khi push vào `main`.

## Lưu ý bảo mật

- Không commit `.env` hoặc thông tin mật.
- Đổi `JWT_SECRET_KEY` khi deploy production.
- Đổi tài khoản admin mặc định.
- Chỉ cho phép `CORS_ORIGINS` là domain thật.
- Không public Grafana, Prometheus hoặc MinIO Console nếu chưa có bảo vệ.
- Dùng HTTPS cho camera/webcam và production.
- Backup database và object storage định kỳ.

## Tài liệu liên quan
- [sort/README.md](./sort/README.md)
- [src/yolov5/README.md](./src/yolov5/README.md)
