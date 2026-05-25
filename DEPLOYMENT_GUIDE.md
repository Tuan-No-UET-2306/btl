# Huong dan trien khai LPR System len Internet

Tai lieu nay danh cho repo hien tai:

- Backend: FastAPI tai `src/backend`, chay `uvicorn src.backend.main:app` tren port `8000`.
- Frontend: React + Vite tai `src/frontend`, build bang `npm run build`.
- Worker: Celery, chay `celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info`.
- Dich vu phu tro: Redis, MinIO, PostgreSQL/Supabase.
- API prefix: `/api/v1`.
- WebSocket: `/api/v1/ws/stream` va `/api/v1/ws/videos/{video_id}`.

Muc tieu trien khai:

```text
Internet
  |
  v
DNS -> HTTPS -> NGINX Ingress / NGINX Load Balancer
  |        |        |
  |        |        +--> /api, /docs, /openapi.json -> FastAPI backend
  |        |        +--> /api/v1/ws/*               -> FastAPI WebSocket
  |        |        +--> /                         -> React frontend
  |        |
  |        +--> files.<domain> -> MinIO public objects
  |
  +--> GitHub Actions -> build/test/push Docker images -> Helm deploy to Kubernetes
```

Trong cac lenh ben duoi, thay cac gia tri sau:

| Placeholder | Vi du | Ghi chu |
|---|---|---|
| `OWNER` | `your-github-user` | GitHub owner/org |
| `REPO` | `btl` | Ten repo GitHub |
| `lpr.example.com` | `lpr.your-domain.com` | Domain ung dung |
| `files.lpr.example.com` | `files.lpr.your-domain.com` | Domain public cho MinIO object |
| `lpr` | `lpr` | Kubernetes namespace |

## 1. Chuan bi bien moi truong production

Backend dang doc cau hinh tu `.env` qua `src/backend/core/config.py`. Khi len production, khong commit `.env`; dung Kubernetes Secret.

Bien bat buoc:

```env
DATABASE_URL=postgresql://postgres.vyfyqfpsmpjuqieuzlab:khongmk123gh@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres
JWT_SECRET_KEY=replace-with-long-random-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

CORS_ORIGINS=https://lpr.example.com

MINIO_ENDPOINT=lpr-minio:9000
MINIO_ACCESS_KEY=replace-minio-user
MINIO_SECRET_KEY=replace-minio-password
MINIO_BUCKET=uploaded-videos
MINIO_PUBLIC_URL=https://files.lpr.example.com
MINIO_PUBLIC_READ=true
MINIO_SECURE=false

CELERY_BROKER_URL=redis://lpr-redis:6379/0
CELERY_BACKEND_URL=redis://lpr-redis:6379/0
REDIS_URL=redis://lpr-redis:6379/0
REDIS_EVENT_CHANNEL=lpr:events

VIDEO_DETECT_MODEL_PATH=src/models/LP_detector_nano_61.onnx
VIDEO_OCR_MODEL_PATH=src/models/LP_ocr_nano_62.onnx
VIDEO_DETECT_IMAGE_SIZE=960
VIDEO_OCR_IMAGE_SIZE=640
VIDEO_PROCESS_EVERY_N_FRAMES=10
VIDEO_PROCESS_MAX_FRAMES=900
VIDEO_DETECT_CONFIDENCE=0.35
VIDEO_OCR_CONFIDENCE=0.35
```

Tao secret trong Kubernetes:

```bash
kubectl create namespace lpr

kubectl -n lpr create secret generic lpr-secrets \
  --from-literal=DATABASE_URL='postgresql://postgres.vyfyqfpsmpjuqieuzlab:khongmk123gh@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres' \
  --from-literal=JWT_SECRET_KEY='replace-with-long-random-secret' \
  --from-literal=MINIO_ACCESS_KEY='replace-minio-user' \
  --from-literal=MINIO_SECRET_KEY='replace-minio-password'
```

Khuyen nghi: production nen dung PostgreSQL managed/Supabase nhu repo dang cau hinh. Neu tu host PostgreSQL trong K8s thi can backup, PVC va policy rieng.

## 2. Dong goi Docker

Tao cau truc:

```text
deploy/
  docker/
    backend.Dockerfile
    frontend.Dockerfile
  nginx/
    frontend.conf
    edge.conf
.dockerignore
```

### 2.1. `.dockerignore`

Tao file `.dockerignore` o root:

```dockerignore
.git
.github
.venv
venv
env
__pycache__
**/__pycache__
*.pyc
.pytest_cache
**/node_modules
src/frontend/dist
runs
logs
*.log
.env
docker-compose.override.yml
```

### 2.2. Backend image

Tao `deploy/docker/backend.Dockerfile`:

```dockerfile
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirement.txt ./requirement.txt
RUN pip install --upgrade pip \
  && pip install -r requirement.txt

COPY src ./src
COPY sort ./sort

EXPOSE 8000

CMD ["uvicorn", "src.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build va test local:

```bash
docker build -f deploy/docker/backend.Dockerfile -t lpr-backend:local .
docker run --rm --env-file .env -p 8000:8000 lpr-backend:local
```

Worker dung cung image backend, chi doi command:

```bash
docker run --rm --env-file .env lpr-backend:local \
  celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info
```

### 2.3. Frontend image

Luu y quan trong: `VITE_API_BASE` duoc bake vao file static khi build Vite. Neu deploy cung domain voi NGINX, dat `VITE_API_BASE=https://lpr.example.com`.

Tao `deploy/docker/frontend.Dockerfile`:

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY src/frontend/package*.json ./
RUN npm ci

COPY src/frontend ./

ARG VITE_API_BASE=https://lpr.example.com
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
```

Tao `deploy/nginx/frontend.conf`:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /healthz {
        access_log off;
        return 200 "ok\n";
    }
}
```

Build va test local:

```bash
docker build \
  -f deploy/docker/frontend.Dockerfile \
  --build-arg VITE_API_BASE=http://localhost \
  -t lpr-frontend:local .

docker run --rm -p 8080:80 lpr-frontend:local
```

## 3. NGINX Load Balancer

Co 2 noi dung can tach bach:

- Trong Docker/local: co the chay 1 container NGINX lam reverse proxy.
- Trong Kubernetes: nen dung NGINX Ingress Controller lam load balancer public.

### 3.1. NGINX reverse proxy local

Tao `deploy/nginx/edge.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

upstream frontend_upstream {
    server frontend:80;
}

upstream backend_upstream {
    server backend:8000;
}

upstream minio_upstream {
    server minio:9000;
}

server {
    listen 80;
    server_name lpr.example.com;

    client_max_body_size 1024m;

    location /api/ {
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location = /docs {
        proxy_pass http://backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /openapi.json {
        proxy_pass http://backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Khong expose debug endpoints trong production.
    location /debug/ {
        return 404;
    }

    location / {
        proxy_pass http://frontend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name files.lpr.example.com;

    client_max_body_size 1024m;

    location / {
        proxy_pass http://minio_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Neu muon test day du bang Docker Compose production, co the tao `docker-compose.prod.yml`:

```yaml
services:
  redis:
    image: redis:7
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  backend:
    image: lpr-backend:local
    env_file: .env
    depends_on:
      - redis
      - minio

  worker:
    image: lpr-backend:local
    env_file: .env
    command: celery -A src.backend.tasks.celery_app:celery_app worker --loglevel=info
    depends_on:
      - redis
      - minio

  frontend:
    image: lpr-frontend:local

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    volumes:
      - ./deploy/nginx/edge.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - frontend
      - backend
      - minio

volumes:
  redis_data:
  minio_data:
```

Chay:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

Neu port `80` tren may local da bi service khac chiem, dung port khac cho NGINX:

```env
NGINX_HTTP_PORT=8080
DOCKER_PUBLIC_APP_URL=http://localhost:8080
DOCKER_MINIO_PUBLIC_URL=http://localhost:8080/files
DOCKER_CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

Sau do truy cap:

```text
http://localhost:8080
```

Khi dua len server that voi domain rieng, dat lai:

```env
NGINX_HTTP_PORT=80
DOCKER_PUBLIC_APP_URL=https://lpr.example.com
DOCKER_MINIO_PUBLIC_URL=https://files.lpr.example.com
DOCKER_CORS_ORIGINS=https://lpr.example.com
```

## 4. CI/CD bang GitHub Actions

Pipeline nen lam 4 viec:

1. Test backend.
2. Build frontend.
3. Build va push Docker images len GHCR.
4. Deploy len Kubernetes bang Helm khi push vao `main`.

### 4.1. GitHub Variables va Secrets

Repository variables:

| Name | Vi du |
|---|---|
| `PUBLIC_API_BASE_URL` | `https://lpr.example.com` |
| `APP_DOMAIN` | `lpr.example.com` |
| `FILES_DOMAIN` | `files.lpr.example.com` |

Repository secrets:

| Name | Ghi chu |
|---|---|
| `KUBE_CONFIG` | Noi dung kubeconfig da base64 encode |

Tao `KUBE_CONFIG`:

```bash
base64 -w 0 ~/.kube/config
```

### 4.2. Workflow

Tao `.github/workflows/ci-cd.yml`:

```yaml
name: CI/CD

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379

    env:
      DATABASE_URL: sqlite:///./ci_lpr.db
      JWT_SECRET_KEY: ci-secret
      MINIO_ENDPOINT: localhost:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      MINIO_BUCKET: uploaded-videos
      MINIO_PUBLIC_URL: http://localhost:9000
      MINIO_SECURE: "false"
      CELERY_BROKER_URL: redis://localhost:6379/0
      CELERY_BACKEND_URL: redis://localhost:6379/0
      REDIS_URL: redis://localhost:6379/0

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Start MinIO
        run: |
          docker run -d --name minio \
            -p 9000:9000 \
            -e MINIO_ROOT_USER=minioadmin \
            -e MINIO_ROOT_PASSWORD=minioadmin \
            minio/minio:latest server /data
          for i in {1..30}; do
            if curl -fsS http://localhost:9000/minio/health/live; then
              exit 0
            fi
            sleep 2
          done
          docker logs minio
          exit 1

      - name: Install backend dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirement.txt

      - name: Run backend tests
        run: pytest src/backend/tests

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: src/frontend/package-lock.json

      - name: Install frontend dependencies
        working-directory: src/frontend
        run: npm ci

      - name: Build frontend
        working-directory: src/frontend
        env:
          VITE_API_BASE: ${{ vars.PUBLIC_API_BASE_URL }}
        run: npm run build

  build-and-push:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image_repo: ${{ steps.repo.outputs.image_repo }}
      image_tag: ${{ github.sha }}

    steps:
      - uses: actions/checkout@v4

      - name: Compute lowercase image repo
        id: repo
        run: echo "image_repo=ghcr.io/${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/docker/backend.Dockerfile
          push: true
          tags: |
            ${{ steps.repo.outputs.image_repo }}/backend:${{ github.sha }}
            ${{ steps.repo.outputs.image_repo }}/backend:latest

      - name: Build and push frontend
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/docker/frontend.Dockerfile
          push: true
          build-args: |
            VITE_API_BASE=${{ vars.PUBLIC_API_BASE_URL }}
          tags: |
            ${{ steps.repo.outputs.image_repo }}/frontend:${{ github.sha }}
            ${{ steps.repo.outputs.image_repo }}/frontend:latest

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: build-and-push
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup kubeconfig
        run: |
          echo "${{ secrets.KUBE_CONFIG }}" | base64 -d > kubeconfig
          chmod 600 kubeconfig
          echo "KUBECONFIG=$PWD/kubeconfig" >> "$GITHUB_ENV"

      - name: Install Helm
        uses: azure/setup-helm@v4

      - name: Deploy
        run: |
          helm upgrade --install lpr-system deploy/helm/lpr-system \
            --namespace lpr \
            --create-namespace \
            --set global.imageRegistry=${{ needs.build-and-push.outputs.image_repo }} \
            --set global.imageTag=${{ needs.build-and-push.outputs.image_tag }} \
            --set ingress.host=${{ vars.APP_DOMAIN }} \
            --set ingress.filesHost=${{ vars.FILES_DOMAIN }}
```

Neu test bi loi do SQLite khong tuong thich voi logic `ensure_schema`, doi `DATABASE_URL` trong job test sang PostgreSQL service de giong production hon.

## 5. Kubernetes voi Helm Chart

Tao chart:

```bash
mkdir -p deploy/helm/lpr-system/templates
```

### 5.1. `deploy/helm/lpr-system/Chart.yaml`

```yaml
apiVersion: v2
name: lpr-system
description: LPR System frontend, backend, worker, Redis and MinIO
type: application
version: 0.1.0
appVersion: "1.0.0"
```

### 5.2. `deploy/helm/lpr-system/values.yaml`

```yaml
global:
  imageRegistry: ghcr.io/OWNER/REPO
  imageTag: latest

backend:
  replicas: 2
  image:
    repository: backend
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "2"
      memory: "4Gi"

worker:
  replicas: 1
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "2"
      memory: "4Gi"

frontend:
  replicas: 2
  image:
    repository: frontend

redis:
  image: redis:7
  storage: 2Gi

minio:
  image: minio/minio:latest
  storage: 20Gi

config:
  CORS_ORIGINS: https://lpr.example.com
  MINIO_ENDPOINT: lpr-minio:9000
  MINIO_BUCKET: uploaded-videos
  MINIO_PUBLIC_URL: https://files.lpr.example.com
  MINIO_PUBLIC_READ: "true"
  MINIO_SECURE: "false"
  CELERY_BROKER_URL: redis://lpr-redis:6379/0
  CELERY_BACKEND_URL: redis://lpr-redis:6379/0
  REDIS_URL: redis://lpr-redis:6379/0
  REDIS_EVENT_CHANNEL: lpr:events
  VIDEO_DETECT_MODEL_PATH: src/models/LP_detector_nano_61.onnx
  VIDEO_OCR_MODEL_PATH: src/models/LP_ocr_nano_62.onnx
  VIDEO_DETECT_IMAGE_SIZE: "960"
  VIDEO_OCR_IMAGE_SIZE: "640"
  VIDEO_PROCESS_EVERY_N_FRAMES: "10"
  VIDEO_PROCESS_MAX_FRAMES: "900"
  VIDEO_DETECT_CONFIDENCE: "0.35"
  VIDEO_OCR_CONFIDENCE: "0.35"

secretName: lpr-secrets

ingress:
  enabled: true
  className: nginx
  host: lpr.example.com
  filesHost: files.lpr.example.com
  tlsSecretName: lpr-tls
  filesTlsSecretName: lpr-files-tls
```

### 5.3. `deploy/helm/lpr-system/templates/configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: lpr-config
data:
{{- range $key, $value := .Values.config }}
  {{ $key }}: {{ $value | quote }}
{{- end }}
```

### 5.4. Backend Deployment va Service

Tao `deploy/helm/lpr-system/templates/backend.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lpr-backend
spec:
  replicas: {{ .Values.backend.replicas }}
  selector:
    matchLabels:
      app: lpr-backend
  template:
    metadata:
      labels:
        app: lpr-backend
    spec:
      containers:
        - name: backend
          image: "{{ .Values.global.imageRegistry }}/{{ .Values.backend.image.repository }}:{{ .Values.global.imageTag }}"
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: lpr-config
            - secretRef:
                name: {{ .Values.secretName }}
          readinessProbe:
            httpGet:
              path: /
              port: 8000
            initialDelaySeconds: 20
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 8000
            initialDelaySeconds: 60
            periodSeconds: 30
          resources:
{{ toYaml .Values.backend.resources | indent 12 }}
---
apiVersion: v1
kind: Service
metadata:
  name: lpr-backend
spec:
  selector:
    app: lpr-backend
  ports:
    - name: http
      port: 8000
      targetPort: 8000
```

### 5.5. Worker Deployment

Tao `deploy/helm/lpr-system/templates/worker.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lpr-worker
spec:
  replicas: {{ .Values.worker.replicas }}
  selector:
    matchLabels:
      app: lpr-worker
  template:
    metadata:
      labels:
        app: lpr-worker
    spec:
      containers:
        - name: worker
          image: "{{ .Values.global.imageRegistry }}/{{ .Values.backend.image.repository }}:{{ .Values.global.imageTag }}"
          imagePullPolicy: IfNotPresent
          command:
            - celery
            - -A
            - src.backend.tasks.celery_app:celery_app
            - worker
            - --loglevel=info
          envFrom:
            - configMapRef:
                name: lpr-config
            - secretRef:
                name: {{ .Values.secretName }}
          resources:
{{ toYaml .Values.worker.resources | indent 12 }}
```

### 5.6. Frontend Deployment va Service

Tao `deploy/helm/lpr-system/templates/frontend.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lpr-frontend
spec:
  replicas: {{ .Values.frontend.replicas }}
  selector:
    matchLabels:
      app: lpr-frontend
  template:
    metadata:
      labels:
        app: lpr-frontend
    spec:
      containers:
        - name: frontend
          image: "{{ .Values.global.imageRegistry }}/{{ .Values.frontend.image.repository }}:{{ .Values.global.imageTag }}"
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /healthz
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: lpr-frontend
spec:
  selector:
    app: lpr-frontend
  ports:
    - name: http
      port: 80
      targetPort: 80
```

### 5.7. Redis

Tao `deploy/helm/lpr-system/templates/redis.yaml`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: lpr-redis
spec:
  serviceName: lpr-redis
  replicas: 1
  selector:
    matchLabels:
      app: lpr-redis
  template:
    metadata:
      labels:
        app: lpr-redis
    spec:
      containers:
        - name: redis
          image: {{ .Values.redis.image }}
          command: ["redis-server", "--appendonly", "yes"]
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: redis-data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: redis-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.redis.storage }}
---
apiVersion: v1
kind: Service
metadata:
  name: lpr-redis
spec:
  selector:
    app: lpr-redis
  ports:
    - port: 6379
      targetPort: 6379
```

### 5.8. MinIO

Tao `deploy/helm/lpr-system/templates/minio.yaml`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: lpr-minio
spec:
  serviceName: lpr-minio
  replicas: 1
  selector:
    matchLabels:
      app: lpr-minio
  template:
    metadata:
      labels:
        app: lpr-minio
    spec:
      containers:
        - name: minio
          image: {{ .Values.minio.image }}
          args:
            - server
            - /data
            - --console-address
            - ":9001"
          ports:
            - name: api
              containerPort: 9000
            - name: console
              containerPort: 9001
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.secretName }}
                  key: MINIO_ACCESS_KEY
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.secretName }}
                  key: MINIO_SECRET_KEY
          volumeMounts:
            - name: minio-data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: minio-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.minio.storage }}
---
apiVersion: v1
kind: Service
metadata:
  name: lpr-minio
spec:
  selector:
    app: lpr-minio
  ports:
    - name: api
      port: 9000
      targetPort: 9000
    - name: console
      port: 9001
      targetPort: 9001
```

### 5.9. Ingress NGINX

Tao `deploy/helm/lpr-system/templates/ingress.yaml`:

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lpr-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "1024m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  ingressClassName: {{ .Values.ingress.className }}
  tls:
    - hosts:
        - {{ .Values.ingress.host }}
      secretName: {{ .Values.ingress.tlsSecretName }}
    - hosts:
        - {{ .Values.ingress.filesHost }}
      secretName: {{ .Values.ingress.filesTlsSecretName }}
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: lpr-backend
                port:
                  number: 8000
          - path: /docs
            pathType: Exact
            backend:
              service:
                name: lpr-backend
                port:
                  number: 8000
          - path: /openapi.json
            pathType: Exact
            backend:
              service:
                name: lpr-backend
                port:
                  number: 8000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: lpr-frontend
                port:
                  number: 80
    - host: {{ .Values.ingress.filesHost }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: lpr-minio
                port:
                  number: 9000
{{- end }}
```

Ap dung Helm:

```bash
helm upgrade --install lpr-system deploy/helm/lpr-system \
  --namespace lpr \
  --create-namespace \
  --set global.imageRegistry=ghcr.io/OWNER/REPO \
  --set global.imageTag=latest \
  --set ingress.host=lpr.example.com \
  --set ingress.filesHost=files.lpr.example.com
```

Kiem tra:

```bash
kubectl -n lpr get pods
kubectl -n lpr get svc
kubectl -n lpr get ingress
kubectl -n lpr logs deploy/lpr-backend --tail=100
kubectl -n lpr logs deploy/lpr-worker --tail=100
```

## 6. Dua he thong ra Internet voi Domain va SSL

### 6.1. Cai NGINX Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace
```

Lay external IP:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller
```

Tro DNS:

```text
lpr.example.com         A     <EXTERNAL_IP>
files.lpr.example.com   A     <EXTERNAL_IP>
```

Neu cloud provider tra ve hostname thay vi IP, dung record `CNAME`.

### 6.2. Cai cert-manager va Let's Encrypt

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true
```

Tao `cluster-issuer.yaml`:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

Apply:

```bash
kubectl apply -f cluster-issuer.yaml
```

Kiem tra certificate:

```bash
kubectl -n lpr get certificate
kubectl -n lpr describe certificate lpr-tls
```

## 7. Monitoring va Observability

Muc tieu toi thieu:

- Metrics cluster, pod, CPU, RAM: Prometheus + Grafana.
- Logs tap trung: Loki + Promtail.
- Uptime endpoint: check `/`, `/docs`, `/api/v1/auth/me` hoac endpoint health rieng.
- Alert: pod crash, CPU/RAM cao, backend 5xx, disk PVC gan day, Redis/MinIO unavailable.

### 7.1. Prometheus va Grafana

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

Port-forward Grafana:

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
```

Lay password admin:

```bash
kubectl -n monitoring get secret monitoring-grafana \
  -o jsonpath="{.data.admin-password}" | base64 -d
```

Nen import dashboard:

- Kubernetes / Compute Resources / Namespace.
- NGINX Ingress Controller.
- Redis exporter neu dung Redis production.
- MinIO dashboard neu bat MinIO metrics.

### 7.2. Logs voi Loki

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true
```

Trong Grafana, them data source Loki:

```text
http://loki.monitoring.svc.cluster.local:3100
```

Truy van logs mau:

```logql
{namespace="lpr", app="lpr-backend"}
{namespace="lpr", app="lpr-worker"}
{namespace="lpr", app="lpr-frontend"}
```

### 7.3. Metrics rieng cho FastAPI

Hien tai backend chua expose `/metrics`. Neu can Prometheus scrape chi tiet theo route, cai them:

```bash
pip install prometheus-fastapi-instrumentator
```

Them vao `src/backend/main.py`:

```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator().instrument(app).expose(app)
```

Sau do them `prometheus-fastapi-instrumentator` vao `requirement.txt`, rebuild image va them ServiceMonitor.

## 8. Checklist truoc khi production

- [ ] Da doi `JWT_SECRET_KEY`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`.
- [ ] `CORS_ORIGINS` chi gom domain production can dung.
- [ ] `VITE_API_BASE` cua frontend image la `https://lpr.example.com`.
- [ ] Backend image co kem model `src/models/LP_detector_nano_61.onnx` va `src/models/LP_ocr_nano_62.onnx`.
- [ ] `/debug/*` khong duoc expose ra Internet.
- [ ] PostgreSQL co backup tu dong.
- [ ] MinIO PVC co backup/snapshot hoac chuyen sang S3 managed.
- [ ] NGINX/Ingress cho phep upload video lon bang `proxy-body-size`.
- [ ] WebSocket hoat dong qua HTTPS/WSS.
- [ ] Grafana co alert cho pod crash, 5xx, CPU/RAM, PVC.

## 9. Lenh verify sau deploy

Kiem tra pod:

```bash
kubectl -n lpr get pods -o wide
```

Kiem tra endpoint:

```bash
curl -i https://lpr.example.com/
curl -i https://lpr.example.com/docs
curl -i https://lpr.example.com/api/v1/auth/me
curl -i https://files.lpr.example.com/uploaded-videos/
```

Kiem tra TLS:

```bash
curl -Iv https://lpr.example.com
curl -Iv https://files.lpr.example.com
```

Kiem tra logs:

```bash
kubectl -n lpr logs deploy/lpr-backend --tail=200
kubectl -n lpr logs deploy/lpr-worker --tail=200
kubectl -n lpr logs deploy/lpr-frontend --tail=100
```

Kiem tra rollout:

```bash
kubectl -n lpr rollout status deploy/lpr-backend
kubectl -n lpr rollout status deploy/lpr-worker
kubectl -n lpr rollout status deploy/lpr-frontend
```

Rollback neu ban release moi loi:

```bash
helm -n lpr history lpr-system
helm -n lpr rollback lpr-system <REVISION>
```
