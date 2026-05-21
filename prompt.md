# TRAFFIC VIOLATION & COMPLAINT SYSTEM — TỔNG KẾT THAY ĐỔI

> Dự án LPR System (License Plate Recognition) được mở rộng thêm module **Traffic Violation & Demerit Point System** với quản lý điểm 12, khiếu nại, blacklist tự động, và admin operations.

---

## 1. BACKEND CHANGES

### 1.1. Models mới / Sửa (`src/backend/models/models.py`)

| Model | Bảng | Mô tả |
|-------|------|-------|
| `Owner` | `owners` | Chủ xe (full_name, citizen_id, phone, address) |
| `Vehicle` | `vehicles` | Phương tiện (license_plate, owner_id, type, brand, color, is_blacklist) |
| `Violation` | `violations` | Vi phạm (vehicle_id, **plate_number**, type, points_deducted, fine_amount, status) |
| `Complaint` | `complaints` | Khiếu nại (violation_id, **user_id**, **plate_number**, full_name, citizen_id, reason, status, evidence_url) |

**Điểm mới:** Thêm cột `plate_number` vào Violation và Complaint để lưu trực tiếp biển số, không cần JOIN với Vehicle. Thêm cột `user_id` vào Complaint để phân quyền user chỉ xem khiếu nại của mình.

### 1.2. Schemas mới (`src/backend/models/schemas.py`)

- `TrafficLookupResponse` — kết quả tra cứu biển số
- `ViolationInfo` — thông tin từng vi phạm
- `ComplaintCreate` / `ComplaintResponse` — khiếu nại (+ `case_id: #KP-XXXXX`)
- `ViolationCreate` — admin tạo vi phạm (points 2-10)
- `ComplaintStatusUpdate` — admin approve/reject
- `ViolationUpdate` — admin sửa violation (points 0-12)

### 1.3. Repository `src/backend/repositories/traffic_repository.py`

**Các method chính:**
- `find_vehicle_by_plate()` / `find_owner_by_id()` — tra cứu xe & chủ
- `find_blacklisted_plate()` — kiểm tra blacklist
- `find_pending_violations()` — vi phạm đang pending
- `sum_points_deducted()` / `sum_all_points_deducted()` — tổng điểm
- `create_violation_simple(plate_number, ...)` — **Tạo vi phạm trực tiếp bằng biển số, không cần vehicle_id**
- `create_complaint(violation_id, user_id, ...)` — tạo khiếu nại + gắn user
- `list_complaints(user_id=None)` — nếu có user_id => chỉ lấy của user đó
- `blacklist_vehicle()` / `add_blacklisted_plate()` — blacklist
- `get_latest_violation_date()` — 12-month rule

### 1.4. Service `src/backend/services/traffic_service.py`

**Core Methods:**

| Method | Mô tả |
|--------|-------|
| `lookup_plate(plate)` | Tra biển số → violations by plate_number → tính điểm → auto-blacklist nếu ≥ 12 |
| `create_violation(payload)` | Admin tạo vi phạm (points 2-10). **Không kiểm tra vehicle trong DB** |
| `create_complaint(payload, user_id)` | Gửi khiếu nại (validate 12-digit CCCD) + gắn user_id |
| `update_complaint_status(id, status)` | Admin approve → violation dismissed / reject → violation approved |
| `update_violation(id, payload)` | Admin sửa points (clamp 0-12), fine, type, status |
| `list_complaints(user_id, is_admin)` | Admin xem tất cả, user chỉ xem của mình |

**Business Logic:**
- **Admin tạo vi phạm:** Chỉ cần nhập biển số + loại VP + điểm + tiền phạt. **Không cần biển số có trong DB**.
- **Điểm số:** Clamp 0-12 khi admin chỉnh sửa
- **Auto-blacklist:** Khi tổng điểm ≥ 12 → tự động blacklist

### 1.5. Endpoints `src/backend/api/endpoints/traffic.py`

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/api/v1/traffic/lookup/{plate}` | Bearer | Tra biển số → points + violations |
| POST | `/api/v1/traffic/complaints` | Bearer | Gửi khiếu nại (gắn user_id) |
| GET | `/api/v1/traffic/complaints` | Bearer | Admin xem tất cả, user xem của mình |
| POST | `/api/v1/traffic/violations` | Admin | Tạo vi phạm (không cần vehicle trong DB) |
| PUT | `/api/v1/traffic/complaints/{id}/status` | Admin | Approve/reject khiếu nại |
| PUT | `/api/v1/traffic/violations/{id}` | Admin | Sửa violation (points 0-12) |

### 1.6. Router `src/backend/api/router.py`

Thêm `traffic.router` với prefix `/traffic`

---

## 2. FRONTEND CHANGES

### 2.1. API Clients

| File | Mô tả |
|------|-------|
| `src/frontend/src/api/trafficClient.js` | lookup, createComplaint, listComplaints |

### 2.2. Pages

| File | Route | Mô tả |
|------|-------|-------|
| `src/frontend/src/pages/TrafficLookup.jsx` | `/traffic` | Tra biển số + form khiếu nại + admin create violation section |
| `src/frontend/src/pages/ComplaintHistory.jsx` | `/complaints` | User chỉ xem khiếu nại của mình, admin xem tất cả |
| `src/frontend/src/pages/AdminOperations.jsx` | `/admin` | Admin approve/reject complaint + edit violation (chỉ admin) |

### 2.3. Components

| File | Thay đổi |
|------|---------|
| `src/frontend/src/components/Sidebar.jsx` | Thêm Traffic, Complaints (public) + Operations, Users (admin-only) |

### 2.4. App.jsx

Thêm routes: `/traffic`, `/complaints`, `/admin`

---

## 3. PHÂN QUYỀN CHI TIẾT

| Feature | User | Admin |
|---------|------|-------|
| Tra cứu biển số | ✅ | ✅ |
| Gửi khiếu nại | ✅ | ✅ |
| Xem khiếu nại của mình | ✅ | ✅ |
| Xem tất cả khiếu nại | ❌ | ✅ |
| Tạo vi phạm mới (2-10 points) | ❌ | ✅ (không cần biển số trong DB) |
| Approve/reject khiếu nại | ❌ | ✅ |
| Sửa violation (points 0-12, fine, status) | ❌ | ✅ |
| Quản lý users | ❌ | ✅ |
| Thêm/sửa/xóa blacklist | ❌ | ✅ |

---

## 4. DATABASE (Supabase)

### Các bảng cần có:
- `users` — thêm cột `role VARCHAR(32) NOT NULL DEFAULT 'user'`
- `owners` — chủ xe
- `vehicles` — phương tiện (có `is_blacklist`, `blacklist_reason`)
- `violations` — vi phạm (có **`plate_number VARCHAR(32)`**, `points_deducted`)
- `blacklisted_plates` — danh sách đen
- `complaints` — khiếu nại (có **`user_id INTEGER`**, **`plate_number VARCHAR(32)`**)

### Admin user mặc định:
- Username: `admin` / Password: `admin123`
- Tự động seed khi backend start lần đầu

### SQL tạo cột mới (chạy trên Supabase nếu chưa có):
```sql
ALTER TABLE violations ADD COLUMN IF NOT EXISTS plate_number VARCHAR(32);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS plate_number VARCHAR(32);
```

---

## 5. FILE STRUCTURE TỔNG QUAN

```
src/
├── backend/
│   ├── api/endpoints/traffic.py          # [MỚI] 6 endpoints traffic
│   ├── api/router.py                      # [SỬA] Thêm traffic router
│   ├── api/dependencies.py                # [SỬA] Thêm require_admin()
│   ├── models/models.py                   # [SỬA] Owner, Vehicle, Violation, Complaint
│   ├── models/schemas.py                  # [SỬA] Thêm traffic schemas
│   ├── repositories/traffic_repository.py # [MỚI] Traffic data access
│   └── services/traffic_service.py        # [MỚI] Traffic business logic
├── frontend/
│   ├── src/
│   │   ├── api/trafficClient.js           # [MỚI] Traffic API client
│   │   ├── api/adminClient.js             # [MỚI] Admin API client
│   │   ├── pages/TrafficLookup.jsx        # [MỚI] Tra cứu + khiếu nại + tạo VP
│   │   ├── pages/ComplaintHistory.jsx     # [MỚI] Lịch sử khiếu nại (phân quyền)
│   │   ├── pages/AdminOperations.jsx      # [MỚI] Admin operations
│   │   ├── pages/Blacklist.jsx            # [SỬA] Phân quyền admin/user
│   │   ├── pages/UsersManagement.jsx      # [MỚI] Quản lý users (admin)
│   │   ├── components/Sidebar.jsx         # [SỬA] Thêm các link mới
│   │   ├── styles/global.css              # [SỬA] Thêm bl-modal CSS
│   │   └── App.jsx                        # [SỬA] Thêm routes
│   └── ...
└── prompt.md                              # [SỬA] File này
```

---

## 6. LƯU Ý KHI CHẠY

1. **Admin tạo vi phạm:** Chỉ cần nhập biển số (bất kỳ format), không cần biển số có trong DB
2. **Phân quyền Complaint:** User chỉ thấy khiếu nại của mình, admin thấy tất cả
3. **Admin Operations:** Chỉ admin mới thấy trong sidebar (mục Admin > Operations)
4. **Supabase:** Cần thêm cột `plate_number` vào violations, `user_id` + `plate_number` vào complaints
5. **Login lại:** Sau khi set role admin trên Supabase, phải logout → login lại
6. **Modal:** Blacklist và Users modal dùng class `bl-modal-*` để tránh xung đột DaisyUI