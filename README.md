# LPR System - License Plate Recognition and Traffic Operations Platform

<p align="center">
  <img src="./thumb.jpg" alt="LPR System preview" width="760">
</p>

<p align="center">
  <a href="https://lprtuannoiuemwork.tech/">Production Website</a>
  ·
  <a href="./DEPLOYMENT_GUIDE.md">Deployment Guide</a>
  ·
  <a href="./MONITORING.md">Monitoring Guide</a>
</p>

## 1. Tổng quan

**LPR System** là hệ thống nhận diện biển số xe và hỗ trợ vận hành nghiệp vụ giao thông, được xây dựng theo mô hình web application đầy đủ gồm frontend, backend API, hàng đợi xử lý video, lưu trữ object, cơ sở dữ liệu, realtime WebSocket và monitoring.

Hệ thống sử dụng mô hình nhận diện biển số dựa trên **YOLOv5**, kết hợp detector biển số và OCR ký tự biển số. Backend được xây dựng bằng **FastAPI**, frontend dùng **React + Vite**, dữ liệu nghiệp vụ được lưu trong **PostgreSQL/Supabase**, file ảnh/video được lưu qua **MinIO**, các tác vụ xử lý video chạy bất đồng bộ qua **Celery + Redis**, và hệ thống có sẵn stack quan sát gồm **Prometheus + Grafana**.

Ứng dụng đã được triển khai public tại:

```text
https://lprtuannoiuemwork.tech/
```

README này mô tả đầy đủ mục tiêu, kiến trúc, chức năng, cách chạy local, cách chạy Docker, các biến môi trường, API quan trọng, hướng dẫn vận hành và các lưu ý bảo mật khi triển khai production.

## 2. Mục tiêu dự án

Dự án được xây dựng để giải quyết bài toán nhận diện, quản lý và tra cứu biển số xe trong một hệ thống vận hành tập trung. Các mục tiêu chính:

- Nhận diện biển số từ ảnh tĩnh.
- Nhận diện biển số từ webcam hoặc camera realtime.
- Upload video, xử lý biển số theo frame và xuất video đã vẽ bounding box.
- Lưu lịch sử nhận diện theo từng người dùng.
- Đánh dấu biển số thuộc danh sách đen.
- Tra cứu phương tiện, chủ xe, vi phạm và điểm trừ.
- Cho phép người dùng gửi khiếu nại vi phạm.
- Cung cấp trang quản trị cho admin.
- Theo dõi tình trạng hệ thống qua metrics, logs, Prometheus và Grafana.
- Hỗ trợ triển khai bằng Docker/Nginx trên môi trường production.

## 3. Trạng thái triển khai

| Thành phần | Trạng thái |
|---|---|
| Frontend web | Đã triển khai tại `https://lprtuannoiuemwork.tech/` |
| Backend API | FastAPI, prefix `/api/v1` |
| API documentation | Swagger UI tại `/docs` khi route này được public |
| Object storage | MinIO |
| Queue xử lý video | Redis + Celery worker |
| Database | PostgreSQL/Supabase hoặc PostgreSQL tương thích |
| Monitoring | Prometheus + Grafana, có dashboard dựng sẵn |
| CI/CD | GitHub Actions test backend, build frontend, build/push Docker images |

## 4. Tính năng chính

### 4.1. Xác thực và phân quyền

Hệ thống hỗ trợ đăng ký, đăng nhập và phân quyền theo vai trò:

- `user`: người dùng thông thường, có thể dùng các chức năng nhận diện, xem lịch sử của mình, tra cứu vi phạm và gửi khiếu nại.
- `admin`: tài khoản quản trị, có thêm quyền quản lý user, blacklist, vi phạm và xử lý khiếu nại.

Backend sử dụng JWT bearer token cho các API cần đăng nhập. Frontend lưu token phía client và tự động gửi token qua header `Authorization`.

### 4.2. Dashboard vận hành

Trang Dashboard cung cấp cái nhìn tổng quan về hoạt động nhận diện:

- Số lượt nhận diện trong ngày.
- Số lượt nhận diện trong 7 ngày gần nhất.
- Tổng số lượt nhận diện.
- Số biển số đang nằm trong blacklist.
- Số video đang trong hàng đợi xử lý.
- Biểu đồ hoặc danh sách hoạt động gần đây.
- Trạng thái các video đã upload.

### 4.3. Nhận diện biển số từ ảnh

Trang **LPR Recognition** cho phép người dùng upload ảnh phương tiện. Backend sẽ:

1. Kiểm tra định dạng file.
2. Giải mã ảnh bằng OpenCV/Pillow.
3. Chạy detector biển số bằng YOLOv5.
4. Crop vùng biển số.
5. Chạy OCR ký tự.
6. Ghép ký tự thành biển số hoàn chỉnh.
7. Chuẩn hóa định dạng biển số.
8. Lưu ảnh gốc lên MinIO nếu người dùng đã đăng nhập và bật `persist`.
9. Ghi kết quả vào lịch sử nhận diện.

Các định dạng ảnh được hỗ trợ:

```text
.jpg, .jpeg, .png, .bmp, .tiff, .webp
```

Giới hạn mặc định của file ảnh là 10 MB.

Hệ thống có xử lý cho biển số một dòng, biển số hai dòng kiểu Việt Nam và trường hợp có nhiều biển số trong một ảnh.

### 4.4. Nhận diện realtime bằng webcam

Trang **Webcam Recognition** sử dụng camera của trình duyệt để chụp frame và gửi về API nhận diện. Trình duyệt yêu cầu HTTPS hoặc localhost để dùng `navigator.mediaDevices.getUserMedia`, vì vậy bản production tại `https://lprtuannoiuemwork.tech/` phù hợp cho tính năng webcam.

Luồng xử lý:

1. Người dùng cấp quyền camera.
2. Frontend chụp frame từ video stream.
3. Frame được đóng gói thành ảnh.
4. API `/api/v1/lpr/recognize` hoặc `/api/v1/lpr/realtime-frame` xử lý frame.
5. Kết quả biển số được hiển thị ngay trên giao diện.

### 4.5. Nhận diện realtime theo frame

API `/api/v1/lpr/realtime-frame` được thiết kế nhẹ hơn API nhận diện ảnh thông thường:

- Có thể bật/tắt OCR theo từng request.
- Có thể giới hạn số biển số tối đa trong một frame.
- Có thể cache ảnh crop biển số tạm thời.
- Không ghi lịch sử nhận diện.
- Phù hợp với giao diện camera/video cần cập nhật nhanh bounding box.

### 4.6. Upload và xử lý video

Trang **Video** cho phép người dùng upload video để hệ thống xử lý bất đồng bộ. Luồng xử lý gồm:

1. Người dùng upload video.
2. Backend lưu video lên MinIO.
3. Video được ghi metadata vào PostgreSQL.
4. Người dùng đưa video vào queue xử lý.
5. Celery worker tải video về môi trường xử lý.
6. OpenCV đọc từng frame.
7. Detector tìm vùng biển số.
8. OCR đọc ký tự biển số.
9. Thuật toán tracking/voting gom nhiều frame thành kết quả ổn định.
10. Kết quả detection được lưu vào bảng `video_detections`.
11. Worker vẽ bounding box lên video.
12. Video đã xử lý được transcode sang MP4 nếu có thể.
13. Video kết quả được upload lại lên MinIO.
14. WebSocket gửi progress realtime cho frontend.

Các thông tin được lưu cho mỗi detection video:

- Biển số.
- Confidence.
- Frame number.
- Timestamp trong video.
- Bounding box.
- Kích thước frame.
- Ảnh crop biển số nếu bật upload crop.
- Trạng thái blacklist.

### 4.7. Lịch sử nhận diện

Trang **History** cho phép người dùng quản lý lịch sử nhận diện của chính mình:

- Xem danh sách detection.
- Tìm kiếm theo biển số.
- Lọc theo ngày bắt đầu/kết thúc.
- Lọc theo trạng thái blacklist.
- Phân trang.
- Export CSV.
- Xóa một hoặc nhiều detection.

API lịch sử được scope theo `current_user.id`, vì vậy user thường không xem được dữ liệu của user khác.

### 4.8. Blacklist biển số

Trang **Blacklist** phục vụ việc theo dõi biển số cần cảnh báo.

Quyền truy cập:

- User đã đăng nhập có thể xem danh sách blacklist.
- Chỉ admin được tạo, sửa và xóa blacklist entry.

Khi nhận diện ảnh hoặc video, hệ thống kiểm tra biển số với blacklist để hiển thị cảnh báo trên giao diện.

### 4.9. Tra cứu giao thông và điểm vi phạm

Trang **Traffic** cho phép tra cứu thông tin theo biển số:

- Thông tin phương tiện.
- Thông tin chủ xe nếu có.
- Danh sách vi phạm còn hiệu lực.
- Tổng điểm đã bị trừ.
- Số điểm còn lại trên thang 12 điểm.
- Trạng thái blacklist.
- Lý do blacklist.

Hệ thống có cơ chế tự động đưa biển số vào blacklist nếu tổng điểm trừ đạt hoặc vượt ngưỡng 12 điểm.

### 4.10. Khiếu nại vi phạm

Người dùng có thể gửi khiếu nại cho một vi phạm cụ thể. Mỗi khiếu nại gồm:

- Mã vi phạm.
- Họ tên.
- Căn cước công dân.
- Số điện thoại.
- Địa chỉ.
- Lý do khiếu nại.
- Link bằng chứng nếu có.

Admin có thể duyệt hoặc từ chối khiếu nại:

- Nếu khiếu nại được duyệt, vi phạm liên quan được chuyển sang trạng thái `dismissed`.
- Nếu bị từ chối, vi phạm có thể được giữ hoặc chuyển trạng thái theo logic nghiệp vụ hiện tại.

### 4.11. Quản trị người dùng

Trang **Users** chỉ dành cho admin:

- Xem danh sách user.
- Tạo user mới.
- Cập nhật username, password, role và trạng thái active.
- Xóa user.

### 4.12. Quan sát hệ thống

Backend expose metrics theo định dạng Prometheus. Các nhóm metrics chính:

- Tổng số HTTP request.
- Latency theo endpoint.
- Số lỗi 5xx.
- Số kết nối WebSocket đang active.
- CPU usage.
- Memory usage.
- Metrics mặc định từ `prometheus-fastapi-instrumentator`.

Grafana có dashboard provision sẵn trong thư mục `deploy/grafana/dashboards`.

## 5. Kiến trúc hệ thống

```text
User Browser
    |
    | HTTPS
    v
Public Domain: https://lprtuannoiuemwork.tech/
    |
    v
Nginx / Reverse Proxy
    |
    +-- /                         -> React frontend static app
    +-- /api/v1/*                 -> FastAPI backend
    +-- /docs, /openapi.json      -> API documentation
    +-- /files/*                  -> MinIO public object proxy
    |
    v
FastAPI Backend
    |
    +-- PostgreSQL/Supabase       -> users, detections, videos, traffic data
    +-- MinIO                     -> uploaded images, videos, crops, processed videos
    +-- Redis                     -> Celery broker/result backend, realtime event channel
    +-- WebSocket                 -> video progress and realtime events
    |
    v
Celery Worker
    |
    +-- YOLOv5 detector model
    +-- YOLOv5 OCR model
    +-- OpenCV frame processing
    +-- FFmpeg video transcode
```

Monitoring stack:

```text
FastAPI /metrics
    |
    v
Prometheus
    |
    v
Grafana Dashboard
```

## 6. Công nghệ sử dụng

### 6.1. Backend

| Công nghệ | Vai trò |
|---|---|
| Python 3.10 | Runtime chính |
| FastAPI | REST API, WebSocket, Swagger UI |
| Uvicorn | ASGI server |
| SQLAlchemy 2.x | ORM và kết nối database |
| PostgreSQL/Supabase | Cơ sở dữ liệu nghiệp vụ |
| python-jose | JWT authentication |
| passlib/bcrypt | Hash password |
| Pydantic v2 | Validate request/response schema |
| OpenCV | Đọc ảnh, đọc video, vẽ bounding box |
| PyTorch | Load model YOLOv5 qua `torch.hub` |
| ONNX/ONNXRuntime | Model detector/OCR dạng ONNX |
| Celery | Background task cho xử lý video |
| Redis | Broker/backend cho Celery và pub/sub event |
| MinIO SDK | Upload/download object storage |
| Prometheus client | Metrics endpoint |
| psutil | CPU/memory metrics |

### 6.2. Frontend

| Công nghệ | Vai trò |
|---|---|
| React 18 | UI application |
| Vite 5 | Dev server và build frontend |
| React Router 6 | Routing |
| Tailwind CSS 4 | Styling |
| DaisyUI | UI utility components |
| Lucide React | Icon system |
| Fetch API | Gọi backend API |
| WebSocket | Nhận progress xử lý video |

### 6.3. Infrastructure

| Công nghệ | Vai trò |
|---|---|
| Docker | Đóng gói backend/frontend/service |
| Docker Compose | Chạy full stack local hoặc server |
| Nginx | Serve frontend và reverse proxy API |
| MinIO | Object storage tương thích S3 |
| Redis | Queue và realtime event backend |
| Prometheus | Thu thập metrics |
| Grafana | Dashboard quan sát |
| GitHub Actions | CI/CD |
| GHCR | Docker image registry |

## 7. Cấu trúc thư mục

```text
btl/
├── README.md
├── DEPLOYMENT_GUIDE.md
├── MONITORING.md
├── requirement.txt
├── docker-compose.prod.yml
├── .env.example
├── deploy/
│   ├── docker/
│   │   ├── backend.Dockerfile
│   │   └── frontend.Dockerfile
│   ├── nginx/
│   │   ├── edge.conf
│   │   └── frontend.conf
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   └── alert_rules.yml
│   └── grafana/
│       ├── datasources/
│       └── dashboards/
├── sort/
│   ├── sort.py
│   └── README.md
└── src/
    ├── backend/
    │   ├── api/
    │   │   ├── router.py
    │   │   └── endpoints/
    │   ├── core/
    │   ├── models/
    │   ├── repositories/
    │   ├── services/
    │   ├── socket/
    │   ├── tasks/
    │   ├── tests/
    │   └── main.py
    ├── frontend/
    │   ├── src/
    │   │   ├── api/
    │   │   ├── components/
    │   │   ├── context/
    │   │   ├── layouts/
    │   │   ├── pages/
    │   │   ├── styles/
    │   │   └── utils/
    │   ├── package.json
    │   └── vite.config.js
    ├── models/
    │   ├── LP_detector_nano_61.onnx
    │   ├── LP_detector_nano_61.pt
    │   ├── LP_ocr_nano_62.onnx
    │   └── LP_ocr_nano_62.pt
    └── yolov5/
```

## 8. Model nhận diện

Thư mục `src/models` chứa các model đang được hệ thống sử dụng:

| File | Mục đích |
|---|---|
| `LP_detector_nano_61.onnx` | Detector biển số cho ảnh/video |
| `LP_detector_nano_61.pt` | Bản PyTorch của detector |
| `LP_ocr_nano_62.onnx` | OCR ký tự biển số |
| `LP_ocr_nano_62.pt` | Bản PyTorch của OCR |

Backend load model qua YOLOv5 local source tại `src/yolov5`. Đường dẫn model có thể cấu hình bằng biến môi trường:

```env
VIDEO_DETECT_MODEL_PATH=src/models/LP_detector_nano_61.onnx
VIDEO_OCR_MODEL_PATH=src/models/LP_ocr_nano_62.onnx
```

Các tham số quan trọng:

```env
VIDEO_DETECT_IMAGE_SIZE=960
VIDEO_OCR_IMAGE_SIZE=640
VIDEO_PROCESS_EVERY_N_FRAMES=10
VIDEO_PROCESS_MAX_FRAMES=900
VIDEO_DETECT_CONFIDENCE=0.35
VIDEO_OCR_CONFIDENCE=0.35
VIDEO_REALTIME_DETECT_IMAGE_SIZE=640
VIDEO_REALTIME_OCR_IMAGE_SIZE=320
VIDEO_REALTIME_MAX_PLATES=2
```

## 9. Yêu cầu hệ thống

### 9.1. Chạy local dạng developer

- Python 3.10 trở lên.
- Node.js 20 trở lên.
- npm.
- Docker hoặc Docker Desktop để chạy Redis/MinIO.
- PostgreSQL/Supabase connection string.
- FFmpeg nếu xử lý video.
- Git.

### 9.2. Chạy full stack bằng Docker Compose

- Docker Engine.
- Docker Compose plugin.
- Ít nhất 4 GB RAM cho demo nhỏ.
- Nên có 8 GB RAM trở lên khi xử lý video.
- Dung lượng đĩa đủ cho video upload, video processed và volume MinIO.

### 9.3. Production

- Domain đã trỏ DNS về server.
- HTTPS certificate hoặc reverse proxy có TLS.
- PostgreSQL managed hoặc Supabase.
- Redis ổn định.
- Object storage có volume/backup.
- JWT secret đủ mạnh.
- Tài khoản admin được đổi khỏi giá trị mặc định.
- Firewall chỉ mở các port cần thiết.

## 10. Biến môi trường

Copy file mẫu:

```bash
cp .env.example .env
```

Không commit file `.env`. File này chứa secret, connection string và thông tin truy cập service.

### 10.1. Database và authentication

| Biến | Bắt buộc | Ví dụ | Ghi chú |
|---|---:|---|---|
| `DATABASE_URL` | Có | `postgresql://user:password@host:5432/db?sslmode=require` | PostgreSQL/Supabase URL |
| `JWT_SECRET_KEY` | Có | `replace-with-long-random-secret` | Secret ký JWT |
| `JWT_ALGORITHM` | Không | `HS256` | Thuật toán JWT |
| `JWT_EXPIRE_MINUTES` | Không | `60` | Thời gian hết hạn token |
| `ADMIN_USERNAME` | Không | `admin` | User admin seed ban đầu |
| `ADMIN_PASSWORD` | Không | `change-this-password` | Password admin seed ban đầu |

Lưu ý: backend có thể tạo admin mặc định nếu database chưa có admin. Trong production cần đặt `ADMIN_USERNAME` và `ADMIN_PASSWORD` an toàn, hoặc đổi mật khẩu ngay sau khi khởi tạo.

### 10.2. CORS

```env
CORS_ORIGINS=https://lprtuannoiuemwork.tech,http://localhost:5173,http://localhost:8080
```

Nếu frontend và backend chạy khác origin, cần thêm origin frontend vào biến này.

### 10.3. MinIO

| Biến | Ví dụ local | Ghi chú |
|---|---|---|
| `MINIO_ENDPOINT` | `localhost:9000` | Endpoint API MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | Access key |
| `MINIO_SECRET_KEY` | `minioadmin` | Secret key |
| `MINIO_BUCKET` | `uploaded-videos` | Bucket lưu object |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | Public URL cho object |
| `MINIO_PUBLIC_READ` | `true` | Cho phép object public-read |
| `MINIO_SECURE` | `false` | Dùng HTTPS khi kết nối MinIO |

Khi chạy qua Nginx Docker Compose, public URL thường là:

```env
DOCKER_MINIO_PUBLIC_URL=http://localhost:8080/files
```

Khi triển khai production tại domain hiện tại:

```env
DOCKER_MINIO_PUBLIC_URL=https://lprtuannoiuemwork.tech/files
```

### 10.4. Redis và Celery

```env
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_BACKEND_URL=redis://localhost:6379/0
REDIS_URL=redis://localhost:6379/0
REDIS_EVENT_CHANNEL=lpr:events
```

Trong Docker Compose, backend và worker dùng hostname service nội bộ:

```env
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_BACKEND_URL=redis://redis:6379/0
REDIS_URL=redis://redis:6379/0
```

Compose file đã override các giá trị này cho service backend/worker.

### 10.5. Frontend build

Frontend dùng biến `VITE_API_BASE`. Đây là biến được bake vào file static khi build Vite.

Local dev:

```env
VITE_API_BASE=http://localhost:8000
```

Docker local qua Nginx:

```env
DOCKER_PUBLIC_APP_URL=http://localhost:8080
```

Production:

```env
DOCKER_PUBLIC_APP_URL=https://lprtuannoiuemwork.tech
DOCKER_CORS_ORIGINS=https://lprtuannoiuemwork.tech
```

## 11. Chạy nhanh bằng Docker Compose

Đây là cách khuyến nghị nếu muốn chạy đủ stack gần giống production.

### 11.1. Chuẩn bị `.env`

```bash
cp .env.example .env
```

Cập nhật các giá trị tối thiểu:

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET_KEY=replace-with-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password

DOCKER_PUBLIC_APP_URL=http://localhost:8080
DOCKER_CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
DOCKER_MINIO_PUBLIC_URL=http://localhost:8080/files
```

### 11.2. Build và chạy toàn bộ stack

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Các service sẽ được khởi động:

- `redis`
- `minio`
- `backend`
- `worker`
- `frontend`
- `nginx`
- `prometheus`
- `grafana`

### 11.3. Truy cập local

| Dịch vụ | URL |
|---|---|
| Web app | `http://localhost:8080` |
| MinIO Console | `http://localhost:9001` |
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3000` |

Grafana mặc định:

```text
Username: admin
Password: admin
```

Có thể đổi bằng:

```env
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=change-this-password
```

### 11.4. Kiểm tra container

```bash
docker compose -f docker-compose.prod.yml ps
```

Xem log backend:

```bash
docker logs -f lpr_backend
```

Xem log worker:

```bash
docker logs -f lpr_worker
```

Xem log Nginx:

```bash
docker logs -f lpr_nginx
```

### 11.5. Dừng stack

```bash
docker compose -f docker-compose.prod.yml down
```

Nếu muốn xóa cả volume dữ liệu local:

```bash
docker compose -f docker-compose.prod.yml down -v
```

Chỉ dùng `down -v` khi chắc chắn không cần dữ liệu MinIO/Redis/Grafana local.

## 12. Chạy local dạng developer

Chế độ này phù hợp khi muốn sửa code backend/frontend trực tiếp và reload nhanh.

### 12.1. Tạo Python virtual environment

```bash
python3.10 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

Nếu dùng Windows PowerShell:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

### 12.2. Cài Python dependencies

```bash
pip install -r requirement.txt
```

Nếu muốn cài bản CPU ổn định giống Docker image:

```bash
pip install --index-url https://download.pytorch.org/whl/cpu \
  torch==2.7.0+cpu \
  torchvision==0.22.0+cpu
pip install -r requirement.txt
```

Nếu dùng GPU, cần cài PyTorch/ONNXRuntime GPU đúng CUDA version của máy.

### 12.3. Chạy Redis local

```bash
docker run -d \
  --name lpr-redis-dev \
  -p 6379:6379 \
  redis:7 \
  redis-server --appendonly yes
```

### 12.4. Chạy MinIO local

```bash
docker run -d \
  --name lpr-minio-dev \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

MinIO Console:

```text
http://localhost:9001
```

### 12.5. Cấu hình `.env`

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET_KEY=replace-with-long-random-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=uploaded-videos
MINIO_PUBLIC_URL=http://localhost:9000
MINIO_PUBLIC_READ=true
MINIO_SECURE=false

CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_BACKEND_URL=redis://localhost:6379/0
REDIS_URL=redis://localhost:6379/0
```

### 12.6. Chạy backend

```bash
uvicorn src.backend.main:app --reload --host 0.0.0.0 --port 8000
```

Backend local:

```text
http://localhost:8000
```

Swagger UI:

```text
http://localhost:8000/docs
```

Metrics:

```text
http://localhost:8000/metrics
```

### 12.7. Chạy Celery worker

Mở terminal thứ hai, active cùng virtual environment:

```bash
celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info
```

Worker là bắt buộc nếu muốn xử lý video bất đồng bộ. Nếu worker không chạy, upload video vẫn có thể lưu metadata nhưng thao tác queue/process sẽ lỗi hoặc không hoàn tất.

### 12.8. Chạy frontend

```bash
cd src/frontend
npm install
npm run dev
```

Frontend local:

```text
http://localhost:5173
```

Nếu backend không chạy ở `http://localhost:8000`, tạo file `src/frontend/.env.local`:

```env
VITE_API_BASE=http://localhost:8000
```

## 13. Production deployment tại domain hiện tại

Ứng dụng hiện đã được host tại:

```text
https://lprtuannoiuemwork.tech/
```

Các biến production nên có:

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET_KEY=replace-with-a-long-random-production-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-strong-production-password

CORS_ORIGINS=https://lprtuannoiuemwork.tech
DOCKER_PUBLIC_APP_URL=https://lprtuannoiuemwork.tech
DOCKER_CORS_ORIGINS=https://lprtuannoiuemwork.tech
DOCKER_MINIO_PUBLIC_URL=https://lprtuannoiuemwork.tech/files

MINIO_ACCESS_KEY=replace-minio-access-key
MINIO_SECRET_KEY=replace-minio-secret-key
MINIO_BUCKET=uploaded-videos
MINIO_PUBLIC_READ=true
MINIO_SECURE=false

CELERY_WORKER_CONCURRENCY=1
DB_POOL_SIZE=3
DB_MAX_OVERFLOW=0
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=1800
```

Nếu chạy Docker Compose trực tiếp trên server:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Nếu server có reverse proxy ngoài Docker xử lý HTTPS, có thể để Nginx trong compose lắng nghe HTTP nội bộ, sau đó proxy từ HTTPS vào port compose.

Ví dụ cấu hình ý tưởng:

```text
Internet HTTPS
    -> External Nginx/Caddy/Cloudflare Tunnel
    -> http://127.0.0.1:8080
    -> lpr_nginx
    -> frontend/backend/minio
```

Điểm cần kiểm tra khi triển khai production:

- DNS của `lprtuannoiuemwork.tech` đã trỏ đúng server.
- TLS certificate hoạt động.
- `DOCKER_PUBLIC_APP_URL` dùng đúng `https://lprtuannoiuemwork.tech`.
- `CORS_ORIGINS` chỉ cho phép domain thật.
- Admin password đã đổi.
- `.env` không nằm trong git.
- Port MinIO nội bộ không public nếu không cần.
- Grafana/Prometheus không public trực tiếp nếu chưa có authentication.
- Backup database và MinIO volume.

## 14. API chính

Backend mount API dưới prefix:

```text
/api/v1
```

### 14.1. Authentication

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Đăng ký user |
| `POST` | `/api/v1/auth/login` | Đăng nhập, trả JWT |
| `GET` | `/api/v1/auth/me` | Lấy profile hiện tại |

Ví dụ login:

```bash
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"change-this-password"}'
```

### 14.2. LPR image/realtime

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/lpr/recognize` | Upload ảnh và nhận diện biển số |
| `POST` | `/api/v1/lpr/realtime-frame` | Nhận diện frame realtime, không persist |
| `GET` | `/api/v1/lpr/realtime-crops/{cache_key}` | Lấy ảnh crop tạm thời |

Ví dụ nhận diện ảnh:

```bash
TOKEN="paste-jwt-token-here"

curl -X POST "http://localhost:8000/api/v1/lpr/recognize" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./sample.jpg"
```

Không lưu lịch sử:

```bash
curl -X POST "http://localhost:8000/api/v1/lpr/recognize?persist=false" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./sample.jpg"
```

### 14.3. Detection history

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/v1/detections/` | Danh sách detection của user hiện tại |
| `GET` | `/api/v1/detections/search` | Search/filter/pagination |
| `GET` | `/api/v1/detections/export` | Export CSV |
| `GET` | `/api/v1/detections/stats` | Thống kê dashboard |
| `POST` | `/api/v1/detections/` | Tạo detection thủ công |
| `PUT` | `/api/v1/detections/{id}` | Cập nhật detection |
| `DELETE` | `/api/v1/detections/{id}` | Xóa detection |
| `POST` | `/api/v1/detections/bulk-delete` | Xóa nhiều detection |

Ví dụ search:

```bash
curl "http://localhost:8000/api/v1/detections/search?plate_number=30A&page=1&page_size=20" \
  -H "Authorization: Bearer $TOKEN"
```

### 14.4. Video

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/videos/` | Upload video |
| `GET` | `/api/v1/videos/` | Danh sách video |
| `GET` | `/api/v1/videos/{video_id}` | Chi tiết video |
| `DELETE` | `/api/v1/videos/{video_id}` | Xóa video |
| `POST` | `/api/v1/videos/{video_id}/queue` | Đưa video vào queue xử lý |
| `GET` | `/api/v1/videos/{video_id}/detections` | Danh sách detection của video |
| `POST` | `/api/v1/videos/{video_id}/detections` | Tạo detection video thủ công |
| `DELETE` | `/api/v1/videos/{video_id}/detections/{detection_id}` | Xóa một detection |
| `DELETE` | `/api/v1/videos/{video_id}/detections/by-plate/{plate}` | Xóa detection theo biển số |

Ví dụ upload video:

```bash
curl -X POST "http://localhost:8000/api/v1/videos/" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./sample_video2.mp4"
```

Queue video:

```bash
curl -X POST "http://localhost:8000/api/v1/videos/1/queue" \
  -H "Authorization: Bearer $TOKEN"
```

### 14.5. Blacklist

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/v1/blacklist/` | Xem blacklist |
| `POST` | `/api/v1/blacklist/` | Tạo blacklist entry, admin only |
| `PUT` | `/api/v1/blacklist/{id}` | Cập nhật lý do, admin only |
| `DELETE` | `/api/v1/blacklist/{id}` | Xóa entry, admin only |

Ví dụ thêm blacklist:

```bash
curl -X POST "http://localhost:8000/api/v1/blacklist/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plate_number":"30A-12345","reason":"Demo blacklist entry"}'
```

### 14.6. Traffic

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/v1/traffic/lookup/{plate_number}` | Tra cứu biển số |
| `POST` | `/api/v1/traffic/complaints` | Gửi khiếu nại |
| `GET` | `/api/v1/traffic/complaints` | Danh sách khiếu nại |
| `POST` | `/api/v1/traffic/violations` | Tạo vi phạm, admin only |
| `PUT` | `/api/v1/traffic/violations/{id}` | Cập nhật vi phạm, admin only |
| `PUT` | `/api/v1/traffic/complaints/{id}/status` | Duyệt/từ chối khiếu nại, admin only |

Ví dụ tra cứu:

```bash
curl "http://localhost:8000/api/v1/traffic/lookup/30A-12345" \
  -H "Authorization: Bearer $TOKEN"
```

### 14.7. User management

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/v1/users` | Danh sách user, admin only |
| `POST` | `/api/v1/users` | Tạo user, admin only |
| `PUT` | `/api/v1/users/{id}` | Cập nhật user, admin only |
| `DELETE` | `/api/v1/users/{id}` | Xóa user, admin only |

### 14.8. WebSocket

| Endpoint | Mô tả |
|---|---|
| `/api/v1/ws/stream` | Stream event chung |
| `/api/v1/ws/videos/{video_id}` | Stream progress/detection của một video |

Frontend dùng WebSocket để nhận:

- `video_processing_started`
- `video_progress`
- `video_detection_created`
- `video_processed`
- `video_failed`
- `pong`

## 15. Database schema

Các bảng chính:

| Bảng | Mục đích |
|---|---|
| `users` | Tài khoản, role, trạng thái active |
| `blacklisted_plates` | Danh sách biển số blacklist |
| `detection_histories` | Lịch sử nhận diện ảnh |
| `uploaded_videos` | Metadata video upload |
| `video_detections` | Kết quả nhận diện trên video |
| `owners` | Thông tin chủ xe |
| `vehicles` | Thông tin phương tiện |
| `violations` | Vi phạm giao thông |
| `complaints` | Khiếu nại vi phạm |

Backend gọi `Base.metadata.create_all()` khi startup và có hàm `ensure_schema()` để bổ sung một số cột còn thiếu trên database cũ. Cơ chế này tiện cho demo và bài tập, nhưng với production dài hạn nên bổ sung migration chính thức bằng Alembic để kiểm soát schema version rõ ràng hơn.

## 16. Xử lý video chi tiết

Celery worker xử lý video theo luồng:

1. Lấy video từ database.
2. Đánh dấu trạng thái `processing`.
3. Broadcast event `video_processing_started`.
4. Tải video từ MinIO hoặc URL về file tạm.
5. Mở video bằng OpenCV.
6. Tính FPS, tổng frame, kích thước frame.
7. Cứ mỗi `VIDEO_PROCESS_EVERY_N_FRAMES` frame thì chạy detector.
8. Crop biển số và chạy OCR.
9. Chuẩn hóa biển số.
10. Check blacklist.
11. Tracking theo IOU để gom các detection liên tiếp.
12. Voting để chọn biển số ổn định.
13. Lưu detection ổn định vào database.
14. Upload crop biển số nếu bật `VIDEO_UPLOAD_FRAME_CROPS`.
15. Broadcast event `video_detection_created`.
16. Vẽ overlay lên frame.
17. Ghi video processed dạng WebM.
18. Transcode sang MP4 bằng FFmpeg nếu có thể.
19. Upload processed video lên MinIO.
20. Cập nhật trạng thái `done` hoặc `failed`.

Các biến ảnh hưởng hiệu năng:

```env
VIDEO_PROCESS_EVERY_N_FRAMES=10
VIDEO_PROCESS_MAX_FRAMES=900
VIDEO_TRACK_IOU_THRESHOLD=0.25
VIDEO_STABLE_MIN_VOTES=2
VIDEO_STABLE_MIN_OCR_CONFIDENCE=0.45
VIDEO_FLUSH_MIN_OCR_CONFIDENCE=0.65
CELERY_WORKER_CONCURRENCY=1
```

Nếu server yếu, nên tăng `VIDEO_PROCESS_EVERY_N_FRAMES`, giảm `VIDEO_PROCESS_MAX_FRAMES` và giữ `CELERY_WORKER_CONCURRENCY=1`.

## 17. Monitoring và logging

Tài liệu chi tiết nằm ở [MONITORING.md](./MONITORING.md).

### 17.1. Metrics

Backend expose các metrics:

| Metric | Loại | Mô tả |
|---|---|---|
| `http_requests_total` | Counter | Tổng HTTP request |
| `http_request_duration_seconds` | Histogram | Latency request |
| `http_errors_total` | Counter | Tổng lỗi 5xx |
| `active_websocket_connections` | Gauge | Số WebSocket đang active |
| `system_cpu_usage_percent` | Gauge | CPU usage |
| `system_memory_usage_bytes` | Gauge | Memory usage |
| `fastapi_*` | Mixed | Metrics tự động từ instrumentator |

### 17.2. Prometheus

Chạy trong Docker Compose:

```text
http://localhost:9090
```

Prometheus đọc config từ:

```text
deploy/prometheus/prometheus.yml
```

Alert rules nằm ở:

```text
deploy/prometheus/alert_rules.yml
```

### 17.3. Grafana

Chạy trong Docker Compose:

```text
http://localhost:3000
```

Dashboard được provision từ:

```text
deploy/grafana/dashboards/lpr_dashboard.json
```

Datasource được provision từ:

```text
deploy/grafana/datasources/datasource.yml
```

### 17.4. Logging

Backend dùng structured JSON logging ra stdout. Khi chạy Docker, log được thu bởi Docker logging driver.

Ví dụ log:

```json
{
  "timestamp": "2026-05-26T10:15:30.123456Z",
  "level": "INFO",
  "logger": "src.backend.main",
  "message": "request handled",
  "endpoint": "/api/v1/detections",
  "method": "GET",
  "status_code": 200,
  "client_ip": "127.0.0.1"
}
```

## 18. CI/CD

Workflow nằm tại:

```text
.github/workflows/ci-cd.yml
```

Pipeline hiện có:

| Job | Khi nào chạy | Nội dung |
|---|---|---|
| `backend-test` | Pull request, push main | Cài Python, cài dependency, chạy pytest |
| `frontend-build` | Pull request, push main | Cài Node, npm ci, build Vite |
| `docker-build-push` | Push main | Build và push backend/frontend image lên GHCR |

Docker images được tag:

```text
ghcr.io/<owner>/<repo>/backend:<sha>
ghcr.io/<owner>/<repo>/backend:latest
ghcr.io/<owner>/<repo>/frontend:<sha>
ghcr.io/<owner>/<repo>/frontend:latest
```

## 19. Kiểm thử

### 19.1. Backend tests

Chạy toàn bộ test nhẹ:

```bash
pytest src/backend/tests -q --ignore=src/backend/tests/test_video_ocr.py
```

Chạy cả test OCR/video nếu môi trường có đủ model và dependency:

```bash
pytest src/backend/tests -q
```

### 19.2. Frontend build

```bash
cd src/frontend
npm ci
npm run build
```

### 19.3. Docker smoke test

```bash
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps
```

Kiểm tra web:

```text
http://localhost:8080
```

Kiểm tra API root qua reverse proxy nếu route được proxy:

```bash
curl http://localhost:8080/api/v1/auth/me
```

Endpoint trên cần token nên có thể trả lỗi xác thực; điều quan trọng là backend phản hồi thay vì gateway timeout.

## 20. Quy trình sử dụng cho người dùng

### 20.1. Đăng nhập

1. Truy cập `https://lprtuannoiuemwork.tech/`.
2. Nhập username và password.
3. Sau khi đăng nhập, hệ thống chuyển vào dashboard.

### 20.2. Nhận diện ảnh

1. Vào **LPR Recognition**.
2. Chọn ảnh phương tiện có biển số.
3. Bấm nhận diện.
4. Xem biển số, confidence và các kết quả phụ.
5. Nếu có đăng nhập, kết quả được lưu vào lịch sử.

### 20.3. Nhận diện webcam

1. Vào **Webcam**.
2. Cấp quyền camera cho trình duyệt.
3. Chụp frame hoặc bật chế độ tự động nếu giao diện đang hỗ trợ.
4. Xem kết quả biển số realtime.

### 20.4. Xử lý video

1. Vào **Video**.
2. Chọn file video.
3. Upload video.
4. Queue video để xử lý.
5. Theo dõi progress realtime.
6. Mở video processed sau khi trạng thái là `done`.
7. Xem danh sách biển số phát hiện trong video.

### 20.5. Quản lý blacklist

1. Vào **Blacklist**.
2. User thường xem danh sách.
3. Admin có thể thêm/sửa/xóa biển số.
4. Khi biển số blacklist xuất hiện trong nhận diện, hệ thống hiển thị cảnh báo.

### 20.6. Tra cứu và khiếu nại vi phạm

1. Vào **Traffic**.
2. Nhập biển số cần tra cứu.
3. Xem thông tin phương tiện, điểm trừ và vi phạm.
4. Nếu có vi phạm, user có thể gửi khiếu nại.
5. Vào **Complaints** để xem lịch sử khiếu nại.
6. Admin vào **Operations** để duyệt hoặc từ chối khiếu nại.

## 21. Bảo mật

Các điểm cần chú ý khi vận hành hệ thống:

- Không commit `.env`, file secret, private key hoặc database password.
- Đổi `JWT_SECRET_KEY` trên production.
- Đổi tài khoản admin mặc định.
- Không public Grafana/Prometheus nếu chưa có authentication hoặc firewall.
- Giới hạn `CORS_ORIGINS` về domain thật.
- Không public MinIO Console nếu không cần.
- Dùng HTTPS cho production.
- Giới hạn kích thước upload ở Nginx và backend.
- Backup database định kỳ.
- Backup volume MinIO nếu dùng MinIO tự host.
- Không log password, token hoặc dữ liệu nhạy cảm.
- Kiểm tra quyền admin cho các route quản trị.

Một số route debug đang tồn tại trong backend như `/debug/users` và `/debug/set-admin/{user_id}`. Nginx production trong repo đã chặn `/debug/` bằng `return 404`. Nếu triển khai không qua Nginx này, cần đảm bảo các route debug không public ra Internet.

## 22. Hiệu năng và giới hạn

Các tác vụ nhận diện dùng model AI nên tiêu tốn CPU/RAM đáng kể. Một số lưu ý:

- Xử lý ảnh thường nhanh hơn xử lý video.
- Video dài hoặc độ phân giải cao làm tăng thời gian xử lý.
- Docker image backend dùng bản PyTorch CPU mặc định, phù hợp demo và server không có GPU.
- Nếu có GPU, cần build image/runtime riêng hỗ trợ CUDA.
- Celery concurrency cao có thể làm server hết RAM.
- Nên giới hạn số frame xử lý bằng `VIDEO_PROCESS_MAX_FRAMES`.
- Nên xử lý cách frame bằng `VIDEO_PROCESS_EVERY_N_FRAMES`.
- Nên đặt timeout reverse proxy đủ dài cho upload video.
- Nên theo dõi CPU/memory qua Grafana khi demo.

## 23. Troubleshooting

### 23.1. Lỗi `DATABASE_URL is not configured`

Nguyên nhân: chưa tạo `.env` hoặc chưa set `DATABASE_URL`.

Cách xử lý:

```bash
cp .env.example .env
```

Sau đó cập nhật:

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

### 23.2. Backend không load được model

Kiểm tra file model:

```bash
ls src/models
```

Cần có:

```text
LP_detector_nano_61.onnx
LP_ocr_nano_62.onnx
```

Kiểm tra biến môi trường:

```env
VIDEO_DETECT_MODEL_PATH=src/models/LP_detector_nano_61.onnx
VIDEO_OCR_MODEL_PATH=src/models/LP_ocr_nano_62.onnx
```

### 23.3. Upload ảnh/video lỗi MinIO

Kiểm tra MinIO có chạy không:

```bash
docker ps | grep minio
```

Kiểm tra endpoint:

```env
MINIO_ENDPOINT=localhost:9000
```

Nếu backend chạy trong Docker Compose, endpoint nội bộ phải là:

```env
MINIO_ENDPOINT=minio:9000
```

Compose file đã override giá trị này cho container backend/worker.

### 23.4. Queue video báo Celery unavailable

Kiểm tra Redis:

```bash
docker ps | grep redis
```

Kiểm tra worker:

```bash
docker logs -f lpr_worker
```

Nếu chạy local developer, cần mở terminal riêng và chạy:

```bash
celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info
```

### 23.5. Frontend gọi sai API base

Vite bake `VITE_API_BASE` lúc build. Nếu build frontend với URL sai, frontend sẽ tiếp tục gọi URL sai cho đến khi build lại.

Local:

```env
VITE_API_BASE=http://localhost:8000
```

Production:

```env
VITE_API_BASE=https://lprtuannoiuemwork.tech
```

Docker Compose dùng build arg:

```env
DOCKER_PUBLIC_APP_URL=https://lprtuannoiuemwork.tech
```

Sau khi đổi biến này, cần build lại frontend image.

### 23.6. Lỗi CORS

Thêm origin frontend vào:

```env
CORS_ORIGINS=https://lprtuannoiuemwork.tech,http://localhost:5173
```

Restart backend sau khi đổi `.env`.

### 23.7. Webcam không hoạt động

Trình duyệt chỉ cho phép camera trên:

- `https://...`
- `http://localhost`

Vì vậy webcam có thể không hoạt động nếu truy cập bằng HTTP qua IP LAN hoặc domain chưa có HTTPS.

### 23.8. Grafana không có dữ liệu

Kiểm tra Prometheus target:

```text
http://localhost:9090/targets
```

Kiểm tra service backend đang chạy:

```bash
docker ps | grep lpr_backend
```

Kiểm tra datasource trong Grafana có URL:

```text
http://prometheus:9090
```

## 24. Tài liệu liên quan

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md): hướng dẫn triển khai chi tiết.
- [MONITORING.md](./MONITORING.md): hướng dẫn monitoring, metrics, alert và Grafana.
- [sort/README.md](./sort/README.md): tài liệu SORT tracking library.
- [src/yolov5/README.md](./src/yolov5/README.md): tài liệu YOLOv5 source đi kèm.

## 25. Quy ước phát triển

Khuyến nghị workflow:

1. Tạo branch mới từ `main`.
2. Chạy backend test trước khi mở pull request.
3. Build frontend để kiểm tra lỗi compile.
4. Không commit `.env`, video output, log, cache hoặc `node_modules`.
5. Viết mô tả thay đổi rõ ràng trong pull request.
6. Với thay đổi API, cập nhật README hoặc tài liệu liên quan.
7. Với thay đổi schema lớn, nên bổ sung migration thay vì chỉ sửa `ensure_schema()`.

## 26. Roadmap đề xuất

Một số hướng nâng cấp phù hợp cho giai đoạn tiếp theo:

- Thêm Alembic migration cho database.
- Thêm rate limiting cho API upload và login.
- Thêm refresh token hoặc session rotation.
- Thêm phân quyền chi tiết hơn theo từng resource.
- Thêm audit log cho thao tác admin.
- Thêm trang cấu hình camera/IP camera.
- Hỗ trợ stream RTSP.
- Tối ưu batch inference cho video.
- Tách model service thành microservice riêng nếu tải inference tăng.
- Thêm object lifecycle policy cho MinIO.
- Thêm backup automation cho PostgreSQL và MinIO.
- Thêm end-to-end tests cho frontend.
- Thêm thông báo realtime khi phát hiện biển số blacklist.

## 27. Lưu ý pháp lý và dữ liệu

Hệ thống này phục vụ mục đích học tập, demo, nghiên cứu và hỗ trợ vận hành. Khi áp dụng vào nghiệp vụ thực tế cần:

- Tuân thủ quy định pháp luật về dữ liệu cá nhân.
- Có cơ chế phân quyền và audit rõ ràng.
- Kiểm tra độ chính xác của model trước khi dùng làm căn cứ xử lý.
- Không tự động đưa ra quyết định xử phạt chỉ dựa trên kết quả AI.
- Có quy trình kiểm duyệt thủ công cho các trường hợp nhạy cảm.

## 28. Tóm tắt

LPR System là một nền tảng web hoàn chỉnh cho bài toán nhận diện biển số và quản lý nghiệp vụ giao thông. Dự án không chỉ có phần inference AI mà còn bao gồm xác thực, phân quyền, lịch sử nhận diện, video processing bất đồng bộ, blacklist, tra cứu vi phạm, khiếu nại, admin console, Docker deployment và monitoring production.

Bản public hiện tại:

```text
https://lprtuannoiuemwork.tech/
```
