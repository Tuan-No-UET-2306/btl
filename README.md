# License Plate Recognition System

Hệ thống nhận diện biển số xe Việt Nam, quản lý lịch sử nhận diện và hỗ trợ nghiệp vụ vi phạm giao thông. Dự án chọn bài toán **nhận diện biển số xe** trong nhóm bài toán AI thị giác máy tính, có ứng dụng web hoàn chỉnh gồm frontend React, backend FastAPI, pipeline YOLOv5/OCR, xử lý video bất đồng bộ, lưu trữ file và monitoring.

Website demo:

```text
https://lprtuannoiuemwork.tech/
```

Báo cáo chi tiết: [results/Báo_cáo_BTL_AI_SYSTEM.pdf](./results/Báo_cáo_BTL_AI_SYSTEM.pdf)

<p align="center">
  <img src="./results/system_architecture.png" alt="Kiến trúc tổng quan hệ thống LPR" width="760">
</p>

## Đối chiếu tiêu chí chấm điểm

| Tiêu chí | Cách dự án đáp ứng | Minh chứng trong repo |
|---|---|---|
| Chức năng | Nhận diện biển số từ ảnh, video và webcam; lưu lịch sử; tìm kiếm/lọc/export CSV; quản lý blacklist; tra cứu vi phạm; gửi và xử lý khiếu nại; phân quyền user/admin; quản lý người dùng. | `src/backend/api/endpoints/`, `src/backend/services/`, `src/frontend/src/pages/`, ảnh trong `results/` |
| Đảm bảo yêu cầu | Bài toán đã chọn là License Plate Recognition. Hệ thống trả kết quả biển số, tọa độ, độ tin cậy và lưu dữ liệu phục vụ use case quản lý giao thông. Có đủ luồng Guest, User, Admin và các yêu cầu phi chức năng chính: JWT, RBAC, async video, realtime, monitoring. | Báo cáo PDF, `src/models/`, `docker-compose.prod.yml`, `deploy/` |
| Tài liệu | README mô tả dự án, kiến trúc, chức năng, cách cài đặt, cách chạy, API, kiểm thử, demo và tài liệu kết quả. Báo cáo 52 trang nằm trong `results/`. | `README.md`, `results/Báo_cáo_BTL_AI_SYSTEM.pdf` |
| Giao diện người dùng | Frontend React/Vite có giao diện đăng nhập, dashboard, nhận diện ảnh, webcam, lịch sử, traffic lookup, blacklist, khiếu nại, admin operations và quản lý users. | `src/frontend/src/pages/`, ảnh giao diện trong `results/` |
| Điểm cộng | Có ứng dụng web triển khai online, Docker Compose production, Nginx reverse proxy, CI/CD GitHub Actions, Prometheus/Grafana, WebSocket realtime, Celery worker, MinIO storage. | `.github/workflows/ci-cd.yml`, `deploy/`, `docker-compose.prod.yml` |

## Thông tin chung

| Mục | Nội dung |
|---|---|
| Tên dự án | License Plate Recognition System |
| Nhóm | 4conbo |
| Môn học | Thực hành phát triển hệ thống AI |
| Năm học | 2025-2026 |
| Bài toán AI | Nhận diện biển số xe từ ảnh, video và webcam |

## Mục tiêu và phạm vi

Dự án xây dựng một hệ thống LPR có thể dùng trong kịch bản giám sát giao thông, bãi đỗ xe hoặc kiểm soát phương tiện. Hệ thống nhận đầu vào là ảnh, video hoặc webcam, phát hiện vùng biển số bằng model detector, nhận dạng ký tự bằng model OCR, chuẩn hóa biển số và trả kết quả cho người dùng.

Phạm vi chính:

- Nhận diện biển số xe Việt Nam trong ảnh tĩnh, video upload và webcam realtime.
- Lưu trữ lịch sử nhận diện, độ tin cậy, thời gian phát hiện và trạng thái blacklist.
- Quản lý blacklist biển số và nghiệp vụ vi phạm giao thông theo điểm phạt.
- Cho phép người dùng tra cứu vi phạm, gửi khiếu nại và theo dõi trạng thái xử lý.
- Cho phép admin quản lý vi phạm, khiếu nại, blacklist và tài khoản người dùng.
- Cung cấp triển khai Docker, monitoring và CI/CD để có thể tái hiện, đánh giá hệ thống.

## Chức năng đã hoàn thành

### Guest

| Mã UC | Chức năng | Mô tả |
|---|---|---|
| UC-01 | Đăng ký | Tạo tài khoản bằng username/password. |
| UC-02 | Đăng nhập | Xác thực và cấp JWT token. |

### User

| Mã UC | Chức năng | Mô tả |
|---|---|---|
| UC-03 | Dashboard | Xem thống kê tổng quan: số lượt nhận diện, video, blacklist, hoạt động gần đây. |
| UC-04 | Nhận diện ảnh | Upload ảnh và nhận kết quả biển số, bounding box, confidence. |
| UC-05 | Nhận diện video | Upload video, đưa vào hàng đợi Celery và nhận kết quả theo frame. |
| UC-06 | Webcam realtime | Chụp frame từ camera, gửi backend nhận diện và hiển thị kết quả gần thời gian thực. |
| UC-07 | Lịch sử phát hiện | Tìm kiếm, lọc theo biển số/ngày/blacklist, xóa nhiều bản ghi và export CSV. |
| UC-08 | Xem blacklist | Xem danh sách biển số bị cảnh báo. |
| UC-09 | Tra cứu vi phạm | Tra cứu phương tiện, lỗi vi phạm, tiền phạt và điểm trừ. |
| UC-10 | Gửi khiếu nại | Tạo đơn khiếu nại đối với vi phạm. |
| UC-11 | Lịch sử khiếu nại | Theo dõi trạng thái pending/approved/rejected. |

### Admin

| Mã UC | Chức năng | Mô tả |
|---|---|---|
| UC-12 | Quản lý vi phạm | Thêm/sửa thông tin lỗi vi phạm, điểm trừ, tiền phạt và trạng thái. |
| UC-13 | Xử lý khiếu nại | Duyệt hoặc từ chối khiếu nại của người dùng. |
| UC-14 | Quản lý blacklist | Thêm, sửa, xóa biển số trong danh sách đen. |
| UC-15 | Quản lý người dùng | Tạo tài khoản, đổi role user/admin, cập nhật hoặc xóa user. |
| UC-16 | Xuất dữ liệu | Export lịch sử nhận diện ra CSV. |

## Pipeline AI

Hệ thống dùng pipeline hai giai đoạn:

1. **License plate detector** phát hiện và định vị vùng chứa biển số.
2. **OCR model** nhận dạng ký tự trên vùng biển số đã crop.
3. Backend chuẩn hóa chuỗi biển số, tính confidence và trả kết quả dạng JSON.
4. Kết quả được lưu vào database để phục vụ lịch sử, thống kê, blacklist và nghiệp vụ giao thông.

Model nằm trong:

```text
src/models/
├── LP_detector_nano_61.onnx
├── LP_detector_nano_61.pt
├── LP_ocr_nano_62.onnx
└── LP_ocr_nano_62.pt
```

Luồng xử lý theo loại đầu vào:

| Đầu vào | Luồng xử lý |
|---|---|
| Ảnh | Upload ảnh -> detector -> crop biển số -> OCR -> chuẩn hóa -> lưu lịch sử -> trả JSON. |
| Video | Upload video -> lưu MinIO -> đẩy task vào Redis/Celery -> xử lý frame bằng OpenCV + SORT -> cập nhật tiến trình qua WebSocket -> lưu kết quả. |
| Webcam | Browser lấy frame camera -> gửi API realtime -> detector/OCR -> trả kết quả ngay trên giao diện. |

## Kiến trúc hệ thống

```text
Browser
  |
  v
Nginx / HTTPS
  |
  +-- React Frontend
  |
  +-- FastAPI Backend (/api/v1)
        |
        +-- PostgreSQL / Supabase
        +-- MinIO object storage
        +-- Redis broker/pub-sub
        +-- Celery worker
        +-- YOLOv5 detector + OCR models
        +-- Prometheus metrics
```

Các lớp chính:

| Lớp | Vai trò |
|---|---|
| Presentation | React 18, Vite, React Router, Tailwind/DaisyUI; cung cấp toàn bộ giao diện user/admin. |
| API | FastAPI routers dưới prefix `/api/v1`, JWT auth, RBAC, CORS, exception handling. |
| Service + AI | Xử lý nghiệp vụ, inference model, crop/cache realtime, video LPR, traffic và blacklist. |
| Async + Realtime | Celery worker, Redis broker/backend, Redis pub/sub và WebSocket manager. |
| Data Access | SQLAlchemy models/repositories cho users, detections, videos, traffic, blacklist. |
| Observability | `/metrics`, Prometheus, Grafana, structured JSON logs và alert rules. |

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 18, Vite 5, React Router, Tailwind CSS, DaisyUI, Lucide React |
| Backend | Python 3.10, FastAPI, Uvicorn, SQLAlchemy, Pydantic |
| AI/CV | YOLOv5, PyTorch, ONNX, ONNXRuntime, OpenCV, SORT |
| Database | PostgreSQL/Supabase, SQLite cho test |
| Storage | MinIO |
| Queue/Realtime | Redis, Celery, WebSocket |
| Monitoring | Prometheus, Grafana, structured JSON logging |
| Deploy | Docker, Docker Compose, Nginx, GitHub Actions, GHCR |

## Hình ảnh kết quả

### Giao diện người dùng

| Đăng nhập | Dashboard |
|---|---|
| <img src="./results/dangnhap.png" alt="Đăng nhập" width="420"> | <img src="./results/dashboard_user.png" alt="Dashboard user" width="420"> |

| Nhận diện ảnh | Webcam realtime |
|---|---|
| <img src="./results/image_detect.png" alt="Nhận diện ảnh" width="420"> | <img src="./results/webcam_detect.png" alt="Webcam realtime" width="420"> |

| Lịch sử nhận diện | Tra cứu vi phạm |
|---|---|
| <img src="./results/history.png" alt="Lịch sử nhận diện" width="420"> | <img src="./results/traffic.png" alt="Tra cứu vi phạm" width="420"> |

| Blacklist | Lịch sử khiếu nại |
|---|---|
| <img src="./results/blacklist.png" alt="Blacklist" width="420"> | <img src="./results/complaint.jpg" alt="Lịch sử khiếu nại" width="420"> |

### Giao diện quản trị

| Admin dashboard | Xử lý khiếu nại/vi phạm |
|---|---|
| <img src="./results/admin_interface.jpg" alt="Admin dashboard" width="420"> | <img src="./results/admin_operations.png" alt="Admin operations" width="420"> |

| Quản lý người dùng |
|---|
| <img src="./results/user_management.jpg" alt="Quản lý người dùng" width="860"> |

## Cấu trúc thư mục

```text
btl/
├── README.md
├── .env.example
├── requirement.txt
├── docker-compose.prod.yml
├── results/                    # Ảnh kết quả và báo cáo PDF
├── deploy/
│   ├── docker/                 # Dockerfile backend/frontend
│   ├── nginx/                  # Reverse proxy config
│   ├── prometheus/             # Prometheus config + alert rules
│   └── grafana/                # Grafana datasource + dashboard
├── sort/                       # SORT tracker
└── src/
    ├── backend/                # FastAPI app, API, services, repositories, tests
    ├── frontend/               # React/Vite frontend
    ├── models/                 # Detector/OCR weights
    └── yolov5/                 # YOLOv5 source
```

## Cài đặt nhanh bằng Docker Compose

Yêu cầu:

- Docker và Docker Compose.
- PostgreSQL/Supabase connection string hợp lệ.
- Cổng local khả dụng: `8080`, `9001`, `9090`, `3000`.

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
| API docs | `http://localhost:8080/docs` hoặc `http://localhost:8000/docs` khi chạy backend trực tiếp |
| MinIO Console | `http://localhost:9001` |
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3000` |

Kiểm tra container:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

Dừng hệ thống:

```bash
docker compose -f docker-compose.prod.yml down
```

## Chạy local để phát triển

### Backend

```bash
python3.10 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirement.txt
uvicorn src.backend.main:app --reload --host 0.0.0.0 --port 8000
```

Backend:

```text
http://localhost:8000
```

Swagger UI:

```text
http://localhost:8000/docs
```

Nếu chưa cấu hình `ADMIN_USERNAME` và `ADMIN_PASSWORD`, backend sẽ tự tạo admin mặc định:

```text
username: admin
password: admin123
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

Worker xử lý video bất đồng bộ:

```bash
celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info
```

### Frontend

```bash
cd src/frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Nếu backend không chạy ở `http://localhost:8000`, tạo `src/frontend/.env.local`:

```env
VITE_API_BASE=http://localhost:8000
```

## Biến môi trường quan trọng

| Biến | Mô tả |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL/Supabase. |
| `JWT_SECRET_KEY` | Secret ký JWT. |
| `JWT_ALGORITHM` | Thuật toán ký JWT, mặc định `HS256`. |
| `JWT_EXPIRE_MINUTES` | Thời gian sống access token. |
| `CORS_ORIGINS` | Danh sách origin frontend được phép gọi API. |
| `MINIO_ENDPOINT` | Endpoint MinIO. |
| `MINIO_ACCESS_KEY` | MinIO access key. |
| `MINIO_SECRET_KEY` | MinIO secret key. |
| `MINIO_BUCKET` | Bucket lưu ảnh/video. |
| `MINIO_PUBLIC_URL` | Public URL để frontend tải file. |
| `CELERY_BROKER_URL` | Redis broker cho Celery. |
| `CELERY_BACKEND_URL` | Redis result backend cho Celery. |
| `REDIS_URL` | Redis dùng cho realtime events. |
| `VIDEO_DETECT_MODEL_PATH` | Đường dẫn model detector. |
| `VIDEO_OCR_MODEL_PATH` | Đường dẫn model OCR. |
| `VITE_API_BASE` | Base URL API cho frontend. |

## API tiêu biểu

Tất cả API nghiệp vụ dùng prefix:

```text
/api/v1
```

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Đăng ký tài khoản. |
| `POST` | `/api/v1/auth/login` | Đăng nhập và nhận token. |
| `GET` | `/api/v1/auth/me` | Lấy thông tin user hiện tại. |
| `POST` | `/api/v1/lpr/recognize` | Nhận diện biển số từ ảnh upload. |
| `POST` | `/api/v1/lpr/realtime-frame` | Nhận diện frame realtime. |
| `GET` | `/api/v1/detections/search` | Tìm kiếm lịch sử nhận diện. |
| `GET` | `/api/v1/detections/export` | Export lịch sử CSV. |
| `POST` | `/api/v1/videos/` | Upload video. |
| `POST` | `/api/v1/videos/{video_id}/queue` | Đưa video vào hàng đợi xử lý. |
| `GET` | `/api/v1/videos/{video_id}/detections` | Lấy kết quả nhận diện video. |
| `GET` | `/api/v1/blacklist/` | Danh sách blacklist. |
| `POST` | `/api/v1/blacklist/` | Thêm biển số vào blacklist, admin only. |
| `GET` | `/api/v1/traffic/lookup/{plate_number}` | Tra cứu phương tiện/vi phạm. |
| `POST` | `/api/v1/traffic/complaints` | Gửi khiếu nại. |
| `GET` | `/api/v1/traffic/complaints` | Xem danh sách/lịch sử khiếu nại. |
| `POST` | `/api/v1/traffic/violations` | Tạo vi phạm, admin only. |
| `PUT` | `/api/v1/traffic/complaints/{complaint_id}/status` | Duyệt/từ chối khiếu nại, admin only. |
| `GET` | `/api/v1/users/` | Quản lý user, admin only. |

WebSocket:

```text
/api/v1/ws/stream
/api/v1/ws/videos/{video_id}
```

Ví dụ nhận diện ảnh:

```bash
curl -X POST "http://localhost:8000/api/v1/lpr/recognize" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./sample.jpg"
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

Các nhóm test hiện có:

| Nhóm | File |
|---|---|
| API/Auth/CRUD | `src/backend/tests/test_api.py` |
| Services | `src/backend/tests/test_services.py` |
| Repositories | `src/backend/tests/test_repositories.py` |
| Video OCR | `src/backend/tests/test_video_ocr.py` |

## Kịch bản demo nhanh

1. Mở web app, đăng ký tài khoản user và đăng nhập.
2. Vào `LPR Recognition`, upload ảnh biển số và kiểm tra kết quả OCR.
3. Vào `Webcam`, bật camera, chụp frame và kiểm tra kết quả realtime.
4. Vào `History`, lọc theo biển số/ngày/blacklist và export CSV.
5. Vào `Traffic`, tra cứu biển số có vi phạm và gửi khiếu nại.
6. Đăng nhập admin, vào `Operations` để duyệt/từ chối khiếu nại và chỉnh vi phạm.
7. Vào `Users` để tạo/sửa role/xóa tài khoản.
8. Vào `Blacklist` để thêm/sửa/xóa biển số cảnh báo.
9. Kiểm tra monitoring tại Prometheus/Grafana nếu chạy bằng Docker Compose.

## Monitoring và vận hành

Backend expose metrics tại:

```text
/metrics
```

Khi chạy Docker Compose:

| Dịch vụ | URL |
|---|---|
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3000` |

Dashboard Grafana được cấu hình sẵn:

```text
deploy/grafana/dashboards/lpr_dashboard.json
```

Prometheus scrape backend theo job:

```text
job_name: lpr-backend
metrics_path: /metrics
target: backend:8000
```

Các metric/alert chính:

| Metric/Alert | Ý nghĩa |
|---|---|
| `http_requests_total` | Tổng số request theo method, endpoint và status. |
| `http_request_duration_seconds` | Latency request. |
| `http_errors_total` | Số lỗi HTTP 5xx. |
| `active_websocket_connections` | Số kết nối WebSocket đang hoạt động. |
| `system_cpu_usage_percent` | CPU usage. |
| `system_memory_usage_bytes` | RAM used/total/available. |
| `HighErrorRate` | Tỷ lệ lỗi 5xx cao. |
| `HighMemoryUsage` | RAM vượt ngưỡng. |
| `BackendUnavailable` | Prometheus không scrape được backend. |
| `HighCpuUsage` | CPU vượt ngưỡng. |

Xem logs:

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f worker
docker compose -f docker-compose.prod.yml logs -f nginx
```

## CI/CD và triển khai

Workflow:

```text
.github/workflows/ci-cd.yml
```

Pipeline chạy khi pull request hoặc push vào `main`:

- Cài Python 3.10 và chạy backend tests.
- Cài Node.js 20 và build frontend.
- Khi push vào `main`, build Docker image backend/frontend và push lên GHCR.

Docker Compose production gồm các service:

| Service | Vai trò |
|---|---|
| `frontend` | React/Vite build được serve bằng Nginx. |
| `backend` | FastAPI API server. |
| `worker` | Celery worker xử lý video. |
| `redis` | Broker, result backend và pub/sub. |
| `minio` | Lưu ảnh/video upload. |
| `prometheus` | Thu thập metrics. |
| `grafana` | Hiển thị dashboard monitoring. |
| `nginx` | Reverse proxy frontend, backend và MinIO files. |

## Lưu ý bảo mật

- Không commit file `.env` hoặc thông tin mật.
- Đổi `JWT_SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` khi deploy.
- Chỉ cấu hình `CORS_ORIGINS` cho domain thật.
- Không public Grafana, Prometheus hoặc MinIO Console nếu chưa có bảo vệ.
- Dùng HTTPS khi truy cập webcam/camera trong môi trường production.
- Backup database và object storage định kỳ.

## Tài liệu và minh chứng

| Tài liệu | Đường dẫn |
|---|---|
| Báo cáo bài tập lớn | [results/Báo_cáo_BTL_AI_SYSTEM.pdf](./results/Báo_cáo_BTL_AI_SYSTEM.pdf) |
| Ảnh kiến trúc | [results/system_architecture.png](./results/system_architecture.png) |
| Ảnh giao diện | [results/](./results/) |
| SORT tracker | [sort/README.md](./sort/README.md) |
| YOLOv5 source | [src/yolov5/README.md](./src/yolov5/README.md) |
