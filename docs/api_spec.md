# 📋 TÀI LIỆU ĐẶC TẢ API (API SPECIFICATION) - UAV-PMS SYSTEM
**Hệ thống Quản lý và Giám sát Lưới điện bằng Thiết bị bay không người lái (UAV PMS)**
*Phiên bản ERD v2.2: Hợp nhất MF01 - MF04. Mô hình dữ liệu đồng bộ với `docs/reports/report3/report3_diagrams/ERD_Full_v2.mmd` (xem thêm `docs/database_schema.md`).*

---

## 1. QUY ƯỚC CHUNG (GENERAL CONVENTIONS)

### 1.1. Base URL & Môi trường Triển khai
- **Local Development (Qua API Gateway Ocelot)**: `http://localhost:5194`
- **Staging / Production (Gateway)**: `https://uavpms.ddns.net`
- **Tiền tố API**:
  - `/api/v1`: Toàn bộ các API tiêu chuẩn của hệ thống (Auth, Users, Hạ tầng & GIS, Missions MF02, Execution MF03, AI Review MF04, Maintenance, Reports, Notifications).
  - `/api/v2`: Alias của `/api/v1` cho luồng Đánh giá Tiền khả thi MF01 (`/api/v{1|2}/pre-mission-assessments`).

### 1.2. Ràng buộc Path Parameters (Bắt buộc GUID)
Mọi tham số ID trên URL định tuyến backend (`{id}`, `{missionId}`, `{towerId}`, `{droneId}`, `{userId}`, `{ticketId}`, `{anomalyId}`, v.v.) đều áp dụng ràng buộc **`guid`** (UUID 36 ký tự: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
- ✅ **HỢP LỆ**: `GET /api/v1/missions/3fa85f64-5717-4562-b3fc-2c963f66afa6`
- ❌ **LỖI 404 NOT FOUND**: `GET /api/v1/missions/MS-2026-0001` *(Router ASP.NET không match regex GUID dẫn đến trả về 404 Not Found ngay lập tức).*

### 1.3. Chuẩn Đóng gói Phản hồi (API Response Envelope)
Tất cả các API trả về theo cấu trúc đóng gói thống nhất `ApiResponse<T>`:
```json
{
  "success": true,
  "message": "Thao tác thành công.",
  "data": { ... }
}
```

Trường hợp danh sách có phân trang (`Pagination`), trường `data` tuân thủ format:
```json
{
  "success": true,
  "message": "Lấy danh sách thành công.",
  "data": {
    "items": [ ... ],
    "totalCount": 120,
    "page": 1,
    "pageSize": 10,
    "totalPages": 12
  }
}
```

Trường hợp lỗi nghiệp vụ / validation:
```json
{
  "success": false,
  "message": "Dữ liệu không hợp lệ hoặc xung đột nghiệp vụ.",
  "errors": [
    "Thời gian bắt đầu nhiệm vụ không được ở trong quá khứ.",
    "Drone đã được gán cho một nhiệm vụ khác trong khung giờ này."
  ]
}
```

### 1.4. Xác thực & Phân quyền (Authentication & RBAC)
Gửi Bearer JWT Token qua HTTP Request Header:
```http
Authorization: Bearer <access_token>
```

Hệ thống định nghĩa 6 vai trò tiêu chuẩn (`UserRoles`):
1. **`SystemAdmin`**: Toàn quyền cấu hình hệ thống, quản lý tài khoản, gán quyền, xem toàn bộ Audit Logs.
2. **`Manager`**: Quản lý vận hành khu vực; lập đánh giá tiền khả thi (MF01), tạo & phân công nhiệm vụ (MF02), phát lệnh bảo trì, duyệt cảnh báo sự cố.
3. **`Pilot` / `Inspector`**: Phi công / Thanh tra viên hiện trường; check-in, nhận/trả drone (MF03), tải ảnh kiểm tra, nạp log bay, báo cáo sự cố.
4. **`Analyst`**: Chuyên viên phân tích AI; duyệt/bác bỏ kết quả phát hiện khiếm khuyết của YOLOv8, gắn phản hồi chuyên môn (MF04).
5. **`Technician`**: Kỹ thuật viên kiểm định drone (MF02) và thợ bảo trì sửa chữa cột điện hiện trường (MF04).

---

## 2. SƠ ĐỒ ĐIỀU HƯỚNG GATEWAY (OCELOT ARCHITECTURE)

```mermaid
graph TD
    Client[Web Frontend / Mobile App / Vision Edge] -->|HTTP / WebSocket| Gateway[UavPms.ApiGateway :5194]
    Gateway -->|/api/v1/auth, /api/v1/users| Identity[IdentityService :8080]
    Gateway -->|/api/v1/users/{id}/geographic-scopes| Operations
    Gateway -->|/api/v1/regions, /towers, /gis, /drones, /pre-mission-assessments, /missions, /maintenance, /reports...| Operations[OperationsService :8080]
    Gateway -->|/api/v2/pre-mission-assessments| Operations
    Gateway -->|/api/v1/ai-analysis, /api/v1/missions/{id}/ai-analysis, /api/v1/vision| AIInspection[AIInspectionService :8080]
    Gateway -->|/api/v1/notifications, /hubs/notifications| Notification[NotificationService :8080]
    Gateway -->|/hangfire| Notification
```

---

## 3. CHI TIẾT TỪNG MODULE API

---

### MODULE 1: XÁC THỰC & NGƯỜI DÙNG (IDENTITYSERVICE)

> [!TIP]
> **MÃ OTP MÔI TRƯỜNG DEV/TEST**: Mặc định là **`123456`**.

#### 1.1. [POST] `/api/v1/auth/login`
- **Mô tả**: Đăng nhập tài khoản bằng email và mật khẩu. Tự động kiểm tra thiết bị tin cậy (`device_trust_token`).
- **Phân quyền**: Public
- **Request Body**:
  ```json
  {
    "email": "manager@uavpms.com",
    "password": "Password123@",
    "deviceFingerprint": "browser-chrome-linux-uuid"
  }
  ```
- **Response `200 OK` (Khi không yêu cầu OTP)**:
  ```json
  {
    "success": true,
    "message": "Đăng nhập thành công.",
    "data": {
      "requiresOtp": false,
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "7a90ab8e-5b12-4a...",
      "expiresAt": "2026-10-19T21:30:00Z",
      "user": {
        "id": "11111111-1111-1111-1111-111111111111",
        "username": "manager_hp",
        "email": "manager@uavpms.com",
        "fullName": "Nguyễn Văn Quản Lý",
        "roles": ["Manager"]
      }
    }
  }
  ```

#### 1.2. [POST] `/api/v1/auth/verify-otp`
- **Mô tả**: Xác thực OTP (khi đăng nhập trên thiết bị lạ hoặc thực hiện hành động nhạy cảm).
- **Phân quyền**: Public
- **Request Body**:
  ```json
  {
    "email": "manager@uavpms.com",
    "otpCode": "123456",
    "trustDevice": true
  }
  ```

#### 1.3. [POST] `/api/v1/auth/refresh-token`
- **Mô tả**: Cấp mới Access Token bằng Refresh Token.
- **Request Body**:
  ```json
  {
    "refreshToken": "7a90ab8e-5b12-4a..."
  }
  ```

#### 1.4. [GET] `/api/v1/users`
- **Mô tả**: Lấy danh sách nhân sự trong hệ thống có phân trang và lọc theo vai trò.
- **Phân quyền**: `SystemAdmin`, `Manager`
- **Query Params**: `role` (Pilot, Technician, Analyst...), `search`, `page`, `pageSize`

#### 1.5. [GET] `/api/v1/users/{id}`
- **Mô tả**: Xem thông tin chi tiết một người dùng, quyền hạn và khu vực địa lý được phân quyền.

#### 1.6. [GET|PUT] `/api/v1/users/{id}/geographic-scopes` (OperationsService)
- **Mô tả**: Phạm vi địa lý mặc định của người dùng (bảng `user_geographic_scopes`). Gateway chuyển riêng đường dẫn này sang OperationsService (route `Priority: 100`); các đường dẫn `/users` khác vẫn đi IdentityService. Bộ lọc GIS cho phép người dùng thấy các khu vực được gán **và các khu vực con trực tiếp** của chúng, cộng với cột điện của nhiệm vụ/phiếu bảo trì đang được giao.
- **[GET] Phân quyền**: `SystemAdmin`, `Manager` xem của mọi người; vai trò khác chỉ xem của chính mình (người khác → `403`).
- **[PUT] Phân quyền**: `SystemAdmin`, `Manager`. Manager không được sửa phạm vi của chính mình (`403`), vì Manager không có phạm vi nào được xem toàn bộ bản đồ.
- **[PUT] Request Body**: thay **toàn bộ** phạm vi bằng danh sách gửi lên; `[]` = bỏ hết (Manager không có phạm vi → xem toàn bộ; vai trò khác không có phạm vi → chỉ thấy theo nhiệm vụ/phiếu được giao).
  ```json
  { "regionIds": ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] }
  ```
  - `regionId` trùng được gộp; `00000000-...` → `400 INVALID_REGION`; khu vực không tồn tại → `404`; người dùng không tồn tại → `404`.
- **Response `200 OK`** (`data`, cả GET và PUT):
  ```json
  {
    "userId": "11111111-1111-1111-1111-111111111111",
    "regions": [ { "regionId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "code": "North", "name": "Miền Bắc", "type": "Region" } ]
  }
  ```

---

### MODULE 2: HẠ TẦNG LƯỚI ĐIỆN & GIS (OPERATIONSSERVICE)

> [!NOTE]
> Theo ERD v2.2, hạ tầng chỉ có hai tầng **khu vực → cột điện** (`regions → towers`). Cột điện là đơn vị nhỏ nhất được quản lý. Hệ thống **không còn** API trạm biến áp, đường dây, đoạn dây, đơn vị quản lý, linh kiện (`assets`) và **không còn** API lịch sử tình trạng / mức rủi ro cột điện (`/towers/{id}/condition-history`).

#### 2.1. [GET] `/api/v1/regions`
- **Mô tả**: Lấy danh sách các khu vực quản lý kèm ranh giới Polygon (GeoJSON).
- **Phân quyền**: Toàn bộ người dùng đã xác thực.

#### 2.2. [GET] `/api/v1/towers`
- **Mô tả**: Lấy danh sách cột điện có phân trang, lọc theo khu vực và từ khóa. Kết quả đã lọc theo phạm vi địa lý của người dùng (`user_geographic_scopes`) và sắp xếp theo `towerCode`.
- **Phân quyền**: Toàn bộ người dùng đã xác thực.
- **Query Params**:
  - `page` (mặc định `1`), `pageSize` (mặc định `10`)
  - `regionId`: GUID. Lấy cột thuộc khu vực này hoặc thuộc khu vực con trực tiếp của nó.
  - `search`: Chuỗi, tìm không phân biệt hoa thường trong `towerCode` và `address`.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Lấy danh sách cột điện thành công.",
    "data": {
      "items": [
        {
          "id": "22222222-2222-2222-2222-222222222222",
          "regionId": "33333333-3333-3333-3333-333333333333",
          "regionName": "Khu vực Hải Phòng",
          "towerCode": "NPC_HP_01_001",
          "poleType": "Bê tông ly tâm",
          "address": "Xã An Đồng, Huyện An Dương, Hải Phòng",
          "latitude": 20.8651,
          "longitude": 106.6838
        }
      ],
      "pagination": {
        "page": 1,
        "pageSize": 10,
        "totalItems": 45,
        "totalPages": 5
      }
    }
  }
  ```

#### 2.3. [GET] `/api/v1/towers/{id}`
- **Mô tả**: Xem thông tin một cột điện. `data` có cùng cấu trúc một phần tử `items` ở mục 2.2 (`id`, `regionId`, `regionName`, `towerCode`, `poleType`, `address`, `latitude`, `longitude`).
- **Phân quyền**: Toàn bộ người dùng đã xác thực.
- **Lỗi**: `404` khi không tìm thấy cột hoặc cột nằm ngoài phạm vi địa lý của người dùng.

#### 2.4. [GET] `/api/v1/towers/{id}/history`
- **Mô tả**: Dữ liệu cho trang chi tiết cột điện, gồm **danh sách bất thường** và **lịch sử bảo trì**. Không có điểm sức khỏe hay mức rủi ro.
  - `anomalies`: các `detected_anomalies` có `towerId` = cột này và **chưa bị thay thế** (`supersededById IS NULL`), mới nhất trước. `aiSource` là tên model của lần chạy AI sinh ra bất thường, hoặc `"Manual"` khi bất thường tạo tay.
  - `maintenanceHistory`: các `maintenance_tickets` có bất thường thuộc cột này (`ticket.anomaly.towerId`), mới nhất trước, kèm minh chứng (`proofs`) và vật tư (`materials`) chưa xóa.
- **Phân quyền**: Toàn bộ người dùng đã xác thực.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Lấy lịch sử cột điện thành công.",
    "data": {
      "tower": { "id": "22222222-2222-2222-2222-222222222222", "regionId": "33333333-3333-3333-3333-333333333333", "regionName": "Khu vực Hải Phòng", "towerCode": "NPC_HP_01_001", "poleType": "Bê tông ly tâm", "address": "Xã An Đồng, Huyện An Dương, Hải Phòng", "latitude": 20.8651, "longitude": 106.6838 },
      "anomalies": [
        {
          "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          "mediaId": "99999999-9999-9999-9999-999999999999",
          "missionId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
          "categoryCode": "BROKEN_INSULATOR",
          "categoryName": "Vỡ bát sứ cách điện",
          "confidenceScore": 0.94,
          "validationStatus": "Confirmed",
          "aiSource": "RF-DETR",
          "imageUrl": "https://storage.uavpms.com/annotated/img-01.jpg",
          "cropUrl": "https://storage.uavpms.com/crops/crop-01.jpg",
          "detectedAt": "2026-10-15T08:10:00Z",
          "validatedAt": "2026-10-15T09:00:00Z"
        }
      ],
      "maintenanceHistory": [
        {
          "id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          "ticketCode": "TCK-20261016-001",
          "anomalyId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          "status": "Closed",
          "priority": "High",
          "description": "Thay chuỗi cách điện pha B",
          "managerId": "11111111-1111-1111-1111-111111111111",
          "technicianId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
          "createdAt": "2026-10-16T02:00:00Z",
          "dueDate": "2026-10-20T10:00:00Z",
          "startedAt": "2026-10-17T01:00:00Z",
          "resolvedAt": "2026-10-17T06:00:00Z",
          "proofs": [ { "id": "...", "proofType": "After", "fileUrl": "https://...", "technicianNotes": "Đã thay", "uploadedAt": "2026-10-17T05:50:00Z" } ],
          "materials": [ { "id": "...", "componentCode": "INS-U70", "componentName": "Bát sứ U70", "quantityUsed": 3, "unit": "cái", "loggedAt": "2026-10-17T05:40:00Z" } ]
        }
      ],
      "stats": {
        "totalAnomalies": 5, "pendingAnomalies": 3, "confirmedAnomalies": 1, "openAnomalies": 4,
        "totalTickets": 3, "openTickets": 1, "inProgressTickets": 1, "activeTickets": 2,
        "lastInspectedAt": "2026-10-20T08:00:00Z"
      },
      "anomaliesPagination": { "page": 1, "pageSize": 20, "totalItems": 3, "totalPages": 1 },
      "maintenancePagination": { "page": 1, "pageSize": 20, "totalItems": 3, "totalPages": 1 }
    }
  }
  ```
- **Query Params** (tùy chọn):
  - `page` (mặc định `1`), `pageSize` (mặc định `20`, tối đa `100`): áp dụng **riêng** cho từng danh sách `anomalies` và `maintenanceHistory`, mỗi danh sách có phần `...Pagination` của mình.
  - `validationStatus`: `Pending`, `Confirmed`, `Rejected`, `Resolved` (không phân biệt hoa thường), chỉ lọc `anomalies`.
  - `from`, `to` (ISO 8601): lọc theo thời điểm tạo (`createdAt`) của cả bất thường và phiếu bảo trì; `to` không được trước `from`. Sai tham số → `400` lỗi validation.
- **`stats`**: đếm trực tiếp trên **toàn bộ** cột, không theo bộ lọc/trang; không lưu cột tổng hợp. Bất thường đã bị thay thế không được đếm. `openAnomalies` = `Pending` + `Confirmed`; `inProgressTickets` = `InProgress` + `PendingVerification`; `activeTickets` = `openTickets` + `inProgressTickets`; `lastInspectedAt` = `capturedAt` mới nhất của media gắn cột này.

#### 2.5. [POST] `/api/v1/towers/spatial-query`
- **Mô tả**: Tìm các cột điện giao với một đa giác (GeoJSON Polygon, WGS 84), có thể lọc thêm theo khu vực.
- **Phân quyền**: Toàn bộ người dùng đã xác thực.
- **Request Body**:
  ```json
  {
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [106.680, 20.860],
          [106.690, 20.860],
          [106.690, 20.870],
          [106.680, 20.870],
          [106.680, 20.860]
        ]
      ]
    },
    "filters": {
      "regionId": "33333333-3333-3333-3333-333333333333"
    }
  }
  ```
  - `geometry` bắt buộc, `type = "Polygon"`, vòng ngoài tối thiểu 4 điểm `[lng, lat]`, điểm đầu trùng điểm cuối, kinh độ trong [-180, 180], vĩ độ trong [-90, 90], đa giác hợp lệ.
  - `filters` và `filters.regionId` tùy chọn.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Spatial towers retrieved successfully.",
    "data": {
      "total": 1,
      "towers": [
        {
          "towerId": "22222222-2222-2222-2222-222222222222",
          "id": "22222222-2222-2222-2222-222222222222",
          "towerCode": "NPC_HP_01_001",
          "regionId": "33333333-3333-3333-3333-333333333333",
          "latitude": 20.8651,
          "longitude": 106.6838
        }
      ]
    }
  }
  ```
- **Lỗi**: `400` với `message = "INVALID_GEOMETRY"` khi đa giác không hợp lệ.

#### 2.6. [POST] `/api/v1/towers`
- **Mô tả**: Tạo cột điện mới thuộc một khu vực.
- **Phân quyền**: `SystemAdmin`, `Manager`
- **Request Body**:
  ```json
  {
    "regionId": "33333333-3333-3333-3333-333333333333",
    "towerCode": "NPC_HP_01_002",
    "latitude": 20.8660,
    "longitude": 106.6845,
    "poleType": "Bê tông ly tâm",
    "address": "Xã An Đồng, Huyện An Dương, Hải Phòng"
  }
  ```
  - Bắt buộc: `regionId`, `towerCode` (tối đa 50 ký tự, duy nhất), `latitude` (-90..90), `longitude` (-180..180).
  - Tùy chọn: `poleType` (tối đa 100 ký tự), `address` (tối đa 500 ký tự).
- **Response `201 Created`**: `data` là cột vừa tạo (cấu trúc như mục 2.3).
- **Lỗi**: `404` khi `regionId` không tồn tại; `400 BUSINESS_RULE_VIOLATION` khi `towerCode` đã tồn tại.

#### 2.7. [PUT] `/api/v1/towers/{id}`
- **Mô tả**: Cập nhật cột điện. Request body giống mục 2.6 (`regionId`, `towerCode`, `latitude`, `longitude`, `poleType?`, `address?`).
- **Phân quyền**: `SystemAdmin`, `Manager`
- **Response `200 OK`**: `data` là cột sau khi cập nhật.

#### 2.8. [DELETE] `/api/v1/towers/{id}`
- **Mô tả**: Xóa mềm cột điện (`is_deleted = true`, ghi `deleted_at`).
- **Phân quyền**: `SystemAdmin`, `Manager`
- **Response `200 OK`**: `{ "success": true, "message": "Xóa cột điện thành công." }`

#### 2.9. [POST] `/api/v1/towers/import`
- **Mô tả**: Nhập hàng loạt cột điện từ tệp Excel (`multipart/form-data`, field `file`). Đọc sheet đầu tiên, dòng 1 là tiêu đề, dữ liệu từ dòng 2. Toàn bộ thao tác chạy trong một transaction.
- **Phân quyền**: `SystemAdmin`, `Manager`
- **Cột Excel (theo thứ tự)**:
  | Cột | Nội dung | Bắt buộc |
  |---|---|---|
  | A | Mã khu vực (`regions.code`) hoặc `RegionId` (GUID) | Có |
  | B | Mã cột điện (`towerCode`) | Có |
  | C | Vĩ độ (latitude) | Có |
  | D | Kinh độ (longitude) | Có |
  | E | Loại cột (`poleType`) | Không |
  | F | Địa chỉ (`address`) | Không |
- Dòng bị bỏ qua (tính vào `skippedCount`) khi không tìm thấy khu vực, thiếu mã cột, mã cột đã tồn tại hoặc tọa độ không phải số.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Nhập dữ liệu cột điện hàng loạt thành công.",
    "data": { "success": true, "importedCount": 120, "skippedCount": 3 }
  }
  ```

#### 2.10. [GET] `/api/v1/gis/infrastructure`
- **Mô tả**: Dữ liệu bản đồ hạ tầng: cột điện, bất thường và cảnh báo đang mở. Kết quả đã lọc theo phạm vi địa lý của người dùng.
- **Phân quyền**: Toàn bộ người dùng đã xác thực.
- **Query Params**: `administrativeAreaId` (GUID, tùy chọn). Khi có, chỉ lấy cột thuộc khu vực này hoặc khu vực con trực tiếp của nó.
- **Response `200 OK`** (`data`):
  - `towers[]`: `id`, `code`, `regionId`, `poleType`, `address`, `latitude`, `longitude`.
  - `anomalies[]`: bất thường của các cột trên, chưa bị thay thế (`supersededById IS NULL`). Trường: `id`, `anomalyId`, `towerId`, `towerCode`, `category`, `severity`, `latitude`, `longitude`, `status`, `confidenceScore`, `imageUrl`, `detectedAt`.
  - `alerts[]`: cảnh báo khẩn cấp `status = "Active"` có bất thường thuộc các cột trên. Trường: `id`, `anomalyId`, `towerId`, `towerCode`, `latitude`, `longitude`, `status`, `priority`, `title`, `triggeredAt`.

---

### MODULE 3: ĐỘI BAY UAV & KIỂM ĐỊNH KỸ THUẬT (OPERATIONSSERVICE)

> Route gốc là `/api/v1/drones`. Các endpoint ở module này trả về DTO trực tiếp (không bọc `ApiResponse`).
> Enum dùng chung:
> - `operationalStatus`: `Available`, `Reserved`, `InUse`, `Maintenance`, `Unavailable`, `Lost`.
> - `status` (trạng thái bay): `Idle`, `Flying`, `Maintenance`, `Offline`, `Online`.
> - `technicalHealth`: `Unknown`, `Healthy`, `Warning`, `Critical`.
> - Trạng thái biên bản kiểm định: `Pending`, `InProgress`, `Passed`, `Failed`, `Incomplete`.

#### 3.1. [GET] `/api/v1/drones`
- **Mô tả**: Danh sách drone.
- **Query Params**: `search`, `operationalStatus`, `status`, `technicalHealth`, `regionId`, `availableOnly`, `detailed`.
- **Endpoint liên quan**:
  - `GET /api/v1/drones/available`: drone đang sẵn sàng.
  - `GET /api/v1/drones/eligible`: drone đủ điều kiện cho một nhiệm vụ.
  - `GET|POST /api/v1/drones/estimate-gis-scope`: ước lượng số drone cần cho một phạm vi GIS.

#### 3.2. [GET] `/api/v1/drones/{id}`
- **Mô tả**: Chi tiết một drone. Query `live=true` lấy thêm trạng thái trực tiếp.
- **Endpoint liên quan**:
  - `GET /api/v1/drones/{id}/status`: trạng thái hiện tại.
  - `GET /api/v1/drones/{id}/technical-inspections`: lịch sử kiểm định kỹ thuật.

#### 3.3. [POST] `/api/v1/drones` · [PUT] `/api/v1/drones/{id}` · [DELETE] `/api/v1/drones/{id}`
- **Phân quyền**: `Manager`, `SystemAdmin`, `MaintenanceTechnician` (DELETE chỉ `Manager`, `SystemAdmin`).
- **Request Body (POST/PUT)**:
  ```json
  {
    "code": "UAV-HP-01",
    "name": "Hexa Hải Phòng 01",
    "model": "M300 RTK",
    "category": "Hexacopter",
    "serialNumber": "SN-0001",
    "assignedRegionId": "33333333-3333-3333-3333-333333333333",
    "operationalStatus": "Available",
    "technicalHealth": "Unknown",
    "flightEnduranceMinutes": 30,
    "operationalRangeKm": 10,
    "cameraPayloadInfo": "Zenmuse H20T",
    "batteryLevel": 100
  }
  ```
- **Response**: POST trả `201 Created` kèm `UavDetailsDto`; PUT trả `200 OK` kèm `UavDetailsDto`.

#### 3.4. [POST] `/api/v1/drone-technical-inspections`
- **Mô tả**: Nộp biên bản kiểm định kỹ thuật kèm chỉ số từng phân hệ. Hệ thống chốt `Passed`/`Failed`, tính `validUntil` và cập nhật `technicalHealth` của drone.
- **Phân quyền**: `MaintenanceTechnician`, `Manager`, `SystemAdmin`.
- **Alias**: `POST /api/v1/uavs/{droneId}/inspections` (lấy `droneId` từ path).
- **Request Body**:
  ```json
  {
    "droneId": "88888888-8888-8888-8888-888888888888",
    "notes": "Kiểm định định kỳ tuần 42",
    "policyVersion": "v2.0",
    "flightControllerUid": null,
    "preMissionAssessmentId": null,
    "metrics": [
      {
        "metricCode": "BATTERY_HEALTH",
        "subsystem": "Power",
        "numericValue": 94.0,
        "unit": "%",
        "passed": true,
        "isRequired": true,
        "critical": true,
        "severity": "High"
      }
    ]
  }
  ```
- **Endpoint liên quan**:
  - `POST /api/v1/drones/{id}/basic-technical-check`: kiểm tra kỹ thuật nhanh, trả `DroneTechnicalInspectionSummaryDto`.
  - `GET /api/v1/drone-technical-inspections/drone/{droneId}/latest` (alias `GET /api/v1/uavs/{droneId}/inspections[/latest]`): biên bản mới nhất, `404` nếu chưa có.

#### 3.5. Flight controller của drone
- `POST /api/v1/drones/{droneId}/flight-controller`: ghép flight controller.
- `DELETE /api/v1/drones/{droneId}/flight-controller`: gỡ ghép.
- `GET /api/v1/drones/{droneId}/flight-controller`: flight controller đang ghép.
- `GET /api/v1/drones/{droneId}/flight-controller/history`: lịch sử ghép.

---

### MODULE 4: MF01 - ĐÁNH GIÁ TIỀN KHẢ THI (PRE-MISSION ASSESSMENT V2)

> Route gốc là `/api/v1/pre-mission-assessments` (cũng nhận `/api/v2/...`). Controller v0.9 cũ đã deprecated.
> Phân quyền mặc định: `SystemAdmin`, `Manager`, `Inspector`. Endpoint trả DTO trực tiếp (không bọc `ApiResponse`).
> Trạng thái hồ sơ: `Draft` → `Evaluating` → `Ready` / `NotReady` → `Completed`; ngoài ra `Expired`, `Cancelled`.
> Giá trị cũ `Consumed` = `Completed`, `Incomplete` = `NotReady`.

#### 4.1. [POST] `/api/v1/pre-mission-assessments`
- **Mô tả**: Tạo hồ sơ đánh giá tiền khả thi cho một chiến dịch bay dự kiến.
- **Phân quyền**: `Manager`, `SystemAdmin`
- **Request Body**:
  ```json
  {
    "regionId": "33333333-3333-3333-3333-333333333333",
    "plannedStart": "2026-10-25T08:00:00Z",
    "plannedEnd": "2026-10-25T17:00:00Z",
    "towerIds": [
      "22222222-2222-2222-2222-222222222222",
      "55555555-5555-5555-5555-555555555555"
    ],
    "boundaryWkt": "POLYGON((106.6 20.8, 106.7 20.8, 106.7 20.9, 106.6 20.8))",
    "idempotencyKey": "assess-2026-10-25-hp"
  }
  ```
- **Response `200 OK`**: `PreMissionAssessmentDto`. Các trường chính:
  - định danh: `id`, `assessmentCode`, `managerId`, `regionId`, `regionName`, `version`;
  - kế hoạch: `plannedStart`, `plannedEnd`, `validUntil`;
  - kết quả: `status`, `siteFeasibilityStatus`, `overallTechnicalHealth`, `findings`, `evaluationPolicyVersion`;
  - danh sách: `towers`, `personnelCandidates`, `droneCandidates`;
  - liên kết: `consumedByMissionId` (alias `completedMissionId`).

#### 4.2. [GET] `/api/v1/pre-mission-assessments` · [GET] `/api/v1/pre-mission-assessments/{id}`
- **Query Params (list)**: `status`, `search`, `page`, `pageSize` (mặc định 20).
- **Endpoint liên quan**: `GET /api/v1/pre-mission-assessments/{id}/resource-readiness`: mức sẵn sàng nhân sự và drone.

#### 4.3. Chuyển trạng thái hồ sơ
- `POST /{id}/evaluate`, `POST /{id}/re-evaluate`: chạy (lại) đánh giá bãi bay, UAV, kỹ thuật, nhân sự.
- `POST /{id}/confirm` (`Manager`, `SystemAdmin`): xác nhận hồ sơ đạt (`Ready`).
- `POST /{id}/mark-completed` (alias `/consume`), body `{ "missionId": "..." }`: đánh dấu hồ sơ đã dùng.
- `POST /{id}/cancel`, body `{ "reason": "..." }`: hủy hồ sơ.

#### 4.4. [POST] `/api/v1/pre-mission-assessments/{id}/create-mission`
- **Mô tả**: Tạo nhiệm vụ bay chính thức từ hồ sơ `Ready`. **Đây là cách duy nhất để tạo nhiệm vụ**: endpoint `POST /api/v1/missions` cũ đã bị gỡ.
- **Request Body** (`assessmentId` lấy từ path nếu khác):
  ```json
  {
    "title": "Kiểm tra định kỳ tuyến 22kV An Dương",
    "description": "Chú ý khu vực cột 12-15 có cây cối rậm rạp",
    "personnel": [
      { "userId": "77777777-7777-7777-7777-777777777777", "role": "INSPECTOR", "isRequired": true }
    ],
    "droneIds": ["88888888-8888-8888-8888-888888888888"],
    "priority": "Normal",
    "objective": "PeriodicInspection",
    "priorityDefects": null,
    "emergencyReason": null,
    "isImmediate": false,
    "idempotencyKey": "mission-2026-10-25-hp"
  }
  ```
- **Response `200 OK`**: đối tượng nhiệm vụ vừa tạo.

---

### MODULE 5: MF02 - ĐIỀU PHỐI & PHÂN CÔNG NHIỆM VỤ BAY (OPERATIONSSERVICE)

> Route gốc là `/api/v1/missions`. Nhiệm vụ được tạo qua `POST /api/v1/pre-mission-assessments/{id}/create-mission` (mục 4.4).
> Endpoint trong module này bọc `ApiResponse`.
> Trạng thái nhiệm vụ: `Draft`, `PendingAcceptance`, `Assigned`, `Preparing`, `Ready`, `InProgress`, `Suspended`, `Postponed`, `Completed`, `Cancelled`.

#### 5.1. [GET] `/api/v1/missions`
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`.
- **Query Params**: `page` (mặc định 1), `pageSize` (mặc định 10, tối đa 100), `search`, `status`, `priority`, `sortBy` (mặc định `createdAt`), `sortDescending` (mặc định `true`).
- **Endpoint liên quan**: `GET /api/v1/missions/my`: nhiệm vụ của người dùng hiện tại.

#### 5.2. [GET] `/api/v1/missions/{id}`
- **Mô tả**: Chi tiết nhiệm vụ: cột cần kiểm tra, đội bay được phân công, drone, lịch giữ chỗ tài nguyên.

#### 5.3. Phạm vi nhiệm vụ
- `POST /{id}/scope/resolve`: tính danh sách cột trong phạm vi.
- `PUT /{id}/towers`, body `{ "boundaryWkt": "...", "towerIds": [...] }`: chốt danh sách cột.

#### 5.4. Phân công thành viên
- `GET /{id}/assignments`: danh sách phân công.
- `POST /{id}/assignments` (`Manager`, `SystemAdmin`), body `{ "userId": "...", "assignmentRole": "PILOT" }`. Vai trò: `PILOT`, `CO_PILOT`, `INSPECTOR`, `OBSERVER`. Thành viên nhận thông báo realtime.
- `DELETE /{id}/assignments/{assignmentId}`: gỡ phân công.
- `POST /{id}/assignments/{assignmentId}/reassign` (hoặc `/{id}/assignments/reassign`): đổi người.
- `POST /{id}/assignments/accept`: thành viên nhận nhiệm vụ.
- `POST /{id}/assignments/postpone`, body `{ "reason": "..." }`: thành viên xin hoãn.

#### 5.5. [PUT] `/api/v1/missions/{id}/drone`
- **Mô tả**: Gán drone chính thức (cũng nhận `POST`). Hệ thống kiểm tra xung đột lịch giữ chỗ và hạn kiểm định.
- **Request Body**: `{ "droneId": "88888888-8888-8888-8888-888888888888" }`
- **Endpoint liên quan**: `POST /{id}/drone-handover` và `POST /{id}/drone-handover/return`: bàn giao và hoàn trả drone.

#### 5.6. Điều phối vòng đời
- `POST /{id}/confirm`: xác nhận nhiệm vụ sẵn sàng.
- `POST /{id}/remind`: nhắc thành viên chưa phản hồi.
- `POST /{id}/suspend` (body `reason` bắt buộc), `POST /{id}/resume`, `POST /{id}/postpone`.
- `POST /{id}/cancel`, body `{ "reason": "..." }`: hủy nhiệm vụ, ghi Audit Log và giải phóng tài nguyên đã giữ chỗ.

---

### MODULE 6: MF03 - THỰC THI HIỆN TRƯỜNG & NẠP DỮ LIỆU (OPERATIONSSERVICE)

#### 6.1. [POST] `/api/v1/missions/{id}/check-in`
- **Mô tả**: Thành viên đội bay check-in hiện trường bằng GPS khi có mặt tại điểm tập kết.
- **Phân quyền**: `Pilot`, `Inspector`
- **Request Body**:
  ```json
  {
    "latitude": 20.8655,
    "longitude": 106.6840
  }
  ```

#### 6.2. [POST] `/api/v1/missions/{id}/drone-handover/deliver`
- **Mô tả**: Ký biên bản bàn giao drone trước chuyến bay giữa Thủ kho/Kỹ thuật viên và Phi công trưởng.
- **Request Body**:
  ```json
  {
    "droneId": "88888888-8888-8888-8888-888888888888",
    "receivedByUserId": "77777777-7777-7777-7777-777777777777",
    "initialChecklist": {
      "propellersSecure": true,
      "cameraLensClean": true,
      "gimbalCalibrated": true,
      "batteryPercentage": 100,
      "gpsLockAcquired": true
    }
  }
  ```

#### 6.3. [POST] `/api/v1/missions/{id}/drone-handover/return`
- **Mô tả**: Ký biên bản thu hồi drone sau khi hoàn thành chuyến bay (Ghi nhận hư hại vật lý, số pin còn lại).

#### 6.4. [POST] `/api/v1/missions/{id}/flight-logs`
- **Mô tả**: Nạp file log bay telemetry ghi nhận quỹ đạo GPS, độ cao tối đa, mức pin thấp nhất và thời lượng bay.
- **Request Body**:
  ```json
  {
    "gpsTrack": [
      {"lat": 20.8651, "lon": 106.6838, "alt": 45.2, "time": "2026-10-25T08:15:00Z", "battery": 98},
      {"lat": 20.8658, "lon": 106.6845, "alt": 50.1, "time": "2026-10-25T08:16:00Z", "battery": 96}
    ],
    "minBatteryRecorded": 25.5,
    "maxAltitudeM": 65.0,
    "flightDurationSeconds": 2400,
    "connectionStatus": "Normal"
  }
  ```

#### 6.5. [POST] `/api/v1/missions/{id}/incidents`
- **Mô tả**: Lập biên bản sự cố phát sinh tại hiện trường (Va chạm vật cản, thời tiết cực đoan, lỗi mất sóng). Sự cố chỉ gồm thông tin mô tả, **không có tệp đính kèm** (ERD v2.2 đã bỏ `incident_reports.file_url`).
- **Phân quyền**: `SystemAdmin`, `Manager`, `Inspector`
- **Request Body**:
  ```json
  {
    "incidentType": "Collision",
    "severity": "High",
    "description": "Cánh quạt va quẹt nhẹ cành cây khi hạ độ cao tiếp cận chuỗi sứ",
    "towerId": "22222222-2222-2222-2222-222222222222"
  }
  ```
  - `towerId` tùy chọn (NULL khi sự cố không xảy ra tại cột nào).
- **Response `200 OK`** (`data`): `id`, `missionId`, `reportedBy`, `reporterName`, `towerId`, `incidentType`, `severity`, `description`, `status`, `reportedAt`.
- `[GET] /api/v1/missions/{id}/incidents` trả danh sách sự cố của nhiệm vụ với cùng cấu trúc.

#### 6.6. Tải ảnh/video kiểm tra (`multipart/form-data`)
Hai endpoint cùng gọi `UploadInspectionImageCommand`: lưu tệp, tạo `inspection_media` và phát sự kiện Outbox để kích hoạt phân tích AI. `inspection_media.tower_id` cho phép NULL (video quét hành lang đi qua nhiều cột).

**[POST] `/api/v1/missions/{id}/media`**
- **Phân quyền**: `SystemAdmin`, `Manager`, `Inspector`
- **Form Data**:
  - `file`: một tệp ảnh JPEG/PNG hoặc video MP4.
  - `towerId`: GUID, **tùy chọn**. Nếu không gửi, hệ thống lấy cột đầu tiên trong `mission_targets` của nhiệm vụ; nếu nhiệm vụ chưa có cột thì media không gắn cột (`towerId = null`).
  - `capturedAt`: thời điểm chụp (mặc định thời điểm hiện tại nếu không gửi).
  - `latitude`, `longitude`: tùy chọn.

**[POST] `/api/v1/inspections/upload`**
- **Phân quyền**: `Inspector`
- **Form Data**: `missionId` (GUID), `towerId?` (GUID, tùy chọn; không gửi thì media không gắn cột, NULL = video hành lang; nếu gửi thì cột phải thuộc `mission_targets`), `capturedAt`, `latitude?`, `longitude?`, `file`. Gửi GUID rỗng (`00000000-...`) bị từ chối với lỗi `Tower ID is invalid.`.

- **Response `200 OK`** (cả hai endpoint):
  ```json
  {
    "success": true,
    "message": "Media uploaded successfully.",
    "data": {
      "mediaId": "99999999-9999-9999-9999-999999999999",
      "missionId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
      "towerId": null,
      "fileUrl": "https://storage.uavpms.com/media/img-01.jpg",
      "mediaType": "Image",
      "capturedAt": "2026-10-25T08:15:00Z",
      "checksum": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "fileSizeBytes": 2483011,
      "widthPx": 4000,
      "heightPx": 3000,
      "durationSeconds": null,
      "fps": null,
      "isDuplicate": false
    }
  }
  ```
  - `checksum`: SHA-256 (hex thường) của tệp; `fileSizeBytes`: kích thước tệp. `widthPx/heightPx` đọc từ ảnh JPEG/PNG/WebP/TIFF hoặc track video của MP4; `durationSeconds/fps` chỉ có với MP4. Tệp không đọc được metadata thì các trường này `null`.
  - **Chống trùng (idempotent)**: tải lại đúng tệp đã có (cùng `checksum`) vào **cùng nhiệm vụ** trả về media cũ với `isDuplicate: true`, không lưu tệp, không tạo bản ghi, không phát lại sự kiện phân tích AI. Dùng cho thiết bị edge thử lại khi đồng bộ.
- **Lỗi**: `404` khi `towerId` không tồn tại; `400 INVALID_MISSION_TOWER` khi cột không nằm trong `mission_targets` của nhiệm vụ; `403` khi người gọi không được phân công vào nhiệm vụ; `409 DUPLICATE_MEDIA` khi tệp đã được tải lên cho **nhiệm vụ khác** (`checksum` là duy nhất toàn hệ thống).

---

### MODULE 7: MF04 - PHÂN TÍCH AI & THẨM ĐỊNH KHUYẾT TẬT

> [!NOTE]
> **Mô hình dữ liệu ERD v2.2**: mỗi lần chạy model trên một media là một `ai_analysis_runs` (`executionLocation` = `Edge` hoặc `Cloud`). Mỗi bất thường (`detected_anomalies`) trỏ về lần chạy sinh ra nó qua `analysisRunId` (NULL = tạo tay). Bản edge được kết quả cloud thay thế có `supersededById` trỏ sang bản cloud. Một bản edge bị thay thế khi bản cloud trên **cùng media** có **cùng loại lỗi**, khung hình (video) cách nhau không quá 1 giây và bounding box chồng lấn **IoU ≥ 0.5**. Box chuẩn hóa (0–1) được quy đổi sang pixel theo kích thước media trước khi so; nếu thiếu box hoặc không quy đổi được (media chưa có kích thước) thì chỉ xét cùng loại lỗi. Trường `aiSource` trong mọi API là **giá trị suy ra**: tên model của lần chạy (`ai_analysis_runs.model_name`, nếu trống thì `executionLocation`), hoặc `"Manual"` khi `analysisRunId = null`. `towerId` của bất thường là `uuid` (nullable cho tới khi xác nhận).

#### 7.1. [GET] `/api/v1/ai-analysis/{id}` (AIInspectionService)
- **Mô tả**: Xem một lần chạy AI (`ai_analysis_runs`).
- **Phân quyền**: `Manager`, `Inspector`, `Analyst`
- **Response `200 OK`** (`data`): `id`, `requestedBy` (`uploadedBy` giữ cùng giá trị để tương thích frontend), `mediaId`, `missionId`, `towerId`, `uavId`, `executionLocation`, `modelName`, `modelVersion`, `fileUrl`, `mediaType`, `analysisType`, `status`, `errorMessage`, `createdAt`, `startedAt`, `completedAt`. `fileUrl`, `mediaType`, `missionId`, `towerId` lấy từ media của lần chạy.

#### 7.2. [GET] `/api/v1/missions/{missionId}/ai-analysis/detections` (AIInspectionService)
- **Mô tả**: Danh sách media của nhiệm vụ có kết quả AI, kèm bounding box để vẽ overlay.
- **Phân quyền**: `Manager`, `Inspector`, `Analyst`
- **Response `200 OK`** (`data` là mảng media):
  ```json
  {
    "success": true,
    "message": "Mission AI detections retrieved successfully.",
    "data": [
      {
        "mediaId": "99999999-9999-9999-9999-999999999999",
        "missionId": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "towerId": "22222222-2222-2222-2222-222222222222",
        "mediaType": "Image",
        "fileUrl": "https://storage.uavpms.com/media/img-01.jpg",
        "aiSource": "RF-DETR",
        "validationStatus": "Pending",
        "capturedAt": "2026-10-25T08:15:00Z",
        "createdAt": "2026-10-25T08:16:00Z",
        "detectionCount": 1,
        "videoMetadata": null,
        "detections": [
          {
            "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "mediaId": "99999999-9999-9999-9999-999999999999",
            "analysisRunId": "f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0",
            "executionLocation": "Cloud",
            "supersededById": null,
            "aiDetectionId": "det-0001",
            "categoryCode": "BROKEN_INSULATOR",
            "class": "BROKEN_INSULATOR",
            "categoryName": "Vỡ bát sứ cách điện",
            "categoryDescription": "...",
            "severityWeight": 4,
            "isEmergencyClass": true,
            "confidenceScore": 0.94,
            "confidence": 0.94,
            "frameIndex": null,
            "timestamp": null,
            "imageUrl": "https://storage.uavpms.com/annotated/img-01.jpg",
            "cropUrl": "https://storage.uavpms.com/crops/crop-01.jpg",
            "gps": { "lat": 20.8651, "lng": 106.6838 },
            "towerId": "22222222-2222-2222-2222-222222222222",
            "validationStatus": "Pending",
            "aiSource": "RF-DETR",
            "analystId": null,
            "analystNotes": "",
            "boundingBox": { "x": 0.42, "y": 0.55, "width": 0.12, "height": 0.08 },
            "rawBoundingBox": "{...}",
            "validatedAt": null,
            "createdAt": "2026-10-25T08:16:00Z"
          }
        ]
      }
    ]
  }
  ```
  - `aiSource` ở cấp media: tên model của lần chạy AI mới nhất trên media, `"Manual"` khi media chỉ có bất thường tạo tay.
  - `timestamp`: thời điểm khung hình trong video (giây), đọc từ cột `frame_time_seconds`; tên JSON giữ nguyên cho frontend.
  - `gps`: lấy từ cột `location` (geometry Point).

#### 7.3. [PUT] `/api/v1/missions/{missionId}/ai-analysis/detections/{detectionId}/review` (AIInspectionService)
- **Mô tả**: Analyst chấp nhận hoặc bác bỏ một phát hiện AI và lưu ghi chú.
- **Phân quyền**: `Analyst`
- **Request Body**:
  ```json
  {
    "decision": "Accepted",
    "notes": "Vết nứt sâu, cần thay trong 7 ngày"
  }
  ```
  - `decision`: `Accepted` (chấp nhận cả `Accept`, `Confirmed`, `Confirm`, `Approved`) hoặc `Rejected` (chấp nhận cả `Reject`, `Denied`).
- **Response `200 OK`**: `data` là phát hiện sau khi thẩm định (cấu trúc một phần tử `detections` ở mục 7.2).
- **Quy tắc cột điện**: Khi chấp nhận, nếu bất thường chưa có `towerId`, hệ thống lấy `towerId` của media. Nếu vẫn không có cột, trả `400` với `errorCode: "TOWER_REQUIRED"` (cùng mã với OperationsService, mục 7.4), message `TOWER_REQUIRED: The detection must be linked to a tower before it can be confirmed.`

#### 7.4. [POST|PUT] `/api/v1/missions/{missionId}/detections/{detectionId}/review` (OperationsService)
- **Mô tả**: Thẩm định phát hiện trong ngữ cảnh nhiệm vụ. Khi xác nhận, hệ thống tự sinh phiếu bảo trì nếu bất thường chưa có phiếu.
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- **Request Body**:
  ```json
  {
    "status": "Approved",
    "reviewNotes": "Nguy cơ phóng điện cao",
    "overrideSeverity": "Critical"
  }
  ```
  - `status`: `Approved` / `Confirmed` hoặc `Rejected`. Giá trị khác trả `400 INVALID_REVIEW_STATUS`.
- **Response `200 OK`** (`data`): `detectionId`, `missionId`, `status`, `reviewNotes`, `maintenanceTaskId`, `newAssetHealthScore` (luôn `null`, giữ để tương thích vì tính năng điểm sức khỏe đã bỏ), `reviewedAt`.
- **Lỗi `400 TOWER_REQUIRED`**: bất thường phải gắn cột điện trước khi xác nhận (CHECK `CK_DetectedAnomalies_ConfirmedRequiresTower`). Nếu bất thường chưa có `towerId`, hệ thống lấy `towerId` của media; nếu media cũng không gắn cột thì trả:
  ```json
  {
    "success": false,
    "message": "Khuyết tật phải được gắn với cột điện trước khi xác nhận.",
    "errorCode": "TOWER_REQUIRED"
  }
  ```
- `400 ANOMALY_MISSION_MISMATCH` khi bất thường không thuộc nhiệm vụ.
- `[GET] /api/v1/missions/{id}/detections?status&mediaType&isEmergency` (OperationsService) trả danh sách phát hiện của nhiệm vụ (dạng phẳng: `id`, `missionId`, `mediaId`, `title`, `confidence`, `categoryCode`, `severityWeight`, `isEmergency`, `status`, `boundingBox`, `timestampSeconds`, `timestampLabel`, `frameIndex`, `imageUrl`, `sourceUrl`, `towerId`, `tower`, `gps`, `description`, `detectedAt`, `reviewedByUserId`, `reviewedAt`, `reviewNotes`).

#### 7.5. [GET] `/api/v1/anomalies/pending` (AIInspectionService)
- **Mô tả**: Hàng chờ thẩm định: các bất thường `Pending`, phân trang, tìm theo tên danh mục, mã cột hoặc `towerId`.
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- **Query Params**: `pageIndex` (mặc định `1`), `pageSize` (mặc định `12`), `search`
- **Response `200 OK`** (`data`): `items[]`, `totalCount`, `pageIndex`, `pageSize`, `totalPages`. Mỗi item gồm `id`, `mediaUrl`, `towerId` (uuid), `towerCode`, `missionCode`, `missionName`, `categoryName`, `categoryCode`, `boundingBox`, `confidenceScore`, `validationStatus`, `analystNotes`, `aiModelName`, `aiSource`, `analysisRunId`, `supersededById`, `createdAt`, `severity`, `isEmergency`.

#### 7.6. [PUT] `/api/v1/anomalies/{id}/validate` (AIInspectionService)
- **Mô tả**: Thẩm định nhanh một bất thường từ hàng chờ.
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- **Request Body**:
  ```json
  {
    "status": "Confirmed",
    "analystNotes": "Xác nhận lỗi"
  }
  ```
  - `status`: `Confirmed` / `Approved`, `Rejected` / `Dismissed`, hoặc giá trị khác được ghi thẳng vào `validationStatus`.
- **Quy tắc cột điện**: Khi xác nhận mà bất thường và media đều không có `towerId`, trả `400` với `errorCode: "TOWER_REQUIRED"`, message `TOWER_REQUIRED: The anomaly must be linked to a tower before it can be confirmed.`

#### 7.7. [POST] `/api/v1/missions/{missionId}/ai-analysis/from-media/{mediaId}` (AIInspectionService)
- **Mô tả**: Yêu cầu phân tích cloud cho một media đã có trong nhiệm vụ. Tạo một `ai_analysis_runs` `Pending` với `executionLocation = "Cloud"`, `requestedBy` = người gọi.
- **Phân quyền**: `Manager`, `Analyst`
- **Query Params**: `analysisType` (mặc định `General`), `preferredModel` (mặc định `SERVER`), `notes`

#### 7.8. [POST] `/api/v1/vision/detections`
- **Mô tả**: Webhook tiếp nhận phát hiện thời gian thực từ Edge Device (Camera drone / Vision Edge AI). Mỗi lô kết quả edge ghi một `ai_analysis_runs` với `executionLocation = "Edge"`, `uavId` = drone của nhiệm vụ, `status = "Completed"`; các bất thường mang `analysisRunId` của lần chạy đó và `aiDetectionId` = TrackId của edge.

#### 7.9. [PUT] `/api/v1/anomalies/{id}/tower` (AIInspectionService)
- **Mô tả**: Gán cột điện cho bất thường, dùng trước khi xác nhận (bất thường `Confirmed` bắt buộc có `towerId`). Áp dụng cho bất thường `Pending`, `Rejected` hoặc `Confirmed` (sửa cột gán nhầm).
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- **Request Body**: `{ "towerId": "22222222-2222-2222-2222-222222222222" }`
- **Response `200 OK`** (`data`): `{ "anomalyId": "...", "towerId": "...", "towerCode": "NPC_HP_01_001", "validationStatus": "Pending" }`
- **Lỗi** (`400`, `errorCode`): `INVALID_TOWER` (GUID rỗng); `ANOMALY_SUPERSEDED` (bản edge đã bị cloud thay thế, gán trên bản thay thế); `ANOMALY_RESOLVED` (đã sửa xong, không đổi được). `404` khi bất thường hoặc cột không tồn tại.

#### 7.10. [GET] `/api/v1/anomalies/{id}/tower-suggestions?radiusMeters=300&limit=5` (AIInspectionService)
- **Mô tả**: Gợi ý cột điện gần nhất cho bất thường, xếp theo khoảng cách. Điểm gốc là GPS của bất thường (`source = "Anomaly"`), nếu không có thì vị trí chụp của media (`source = "Media"`). Lọc sơ bộ bằng `ST_DWithin` trên chỉ mục GiST của `towers.geom`, rồi tính khoảng cách mặt cầu (mét).
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- **Query Params**: `radiusMeters` (mặc định `300`, tối đa `5000`), `limit` (mặc định `5`, tối đa `20`).
- **Response `200 OK`** (`data`):
  ```json
  {
    "anomalyId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "currentTowerId": null,
    "source": "Anomaly",
    "latitude": 21.0285, "longitude": 105.8542, "radiusMeters": 300,
    "towers": [
      { "towerId": "22222222-2222-2222-2222-222222222222", "towerCode": "NPC_HN_01_014", "regionId": "33333333-3333-3333-3333-333333333333", "address": "...", "latitude": 21.029, "longitude": 105.8542, "distanceMeters": 55.6, "isCurrent": false }
    ]
  }
  ```
- **Lỗi**: `400 LOCATION_UNKNOWN` khi cả bất thường và media đều không có tọa độ; `404` khi bất thường không tồn tại.

---

### MODULE 8: MF04 - CẢNH BÁO KHẨN CẤP & BẢO TRÌ SỬA CHỮA (OPERATIONSSERVICE)

> Cảnh báo khẩn cấp nằm ở `AlertsController`, route gốc **`/api/v1/alerts`**. Vòng đời trạng thái: `Active` (vừa kích hoạt) → `Confirmed` hoặc `Dismissed` (sau khi thẩm định) hoặc `Escalated` (đã chuyển cấp). Mỗi bất thường có tối đa một cảnh báo `Active` (index `UX_EmergencyAlerts_ActivePerAnomaly`).

#### 8.1. [GET] `/api/v1/alerts/active` và [GET] `/api/v1/alerts?status&page&pageSize`
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- `/active`: các cảnh báo `Status = Active`. Response là **mảng trực tiếp** (không bọc `ApiResponse`), mỗi phần tử: `id`, `anomalyId`, `towerId`, `towerCode`, `alertType`, `categoryName`, `priority`, `status`, `deliveryLatencySeconds`, `triggeredAt`, `location` (`towerCode`, …), `evidence` (`mediaUrl`, `confidenceScore`).
- Danh sách có lọc: `status` (không phân biệt hoa thường), `page` (mặc định `1`), `pageSize` (mặc định `10`). Response trực tiếp: `{ totalCount, page, pageSize, items[] }`, mỗi item: `id`, `towerCode`, `alertType`, `priority`, `status`, `triggeredAt`, `resolvedAt`, `reviewedBy`, `notes`.
- [GET] `/api/v1/alerts/{id}`: chi tiết (thêm `missionId`, `receivedAt`, lịch sử chuyển cấp); `404` khi không tồn tại.

#### 8.2. [PUT] `/api/v1/alerts/{id}/review`
- **Mô tả**: Thẩm định cảnh báo. Body `{ "status": "Confirmed" | "Dismissed", "notes": "..." }`; giá trị khác `Dismissed` được coi là `Confirmed`. Ghi `reviewedById`, `resolvedAt`, `notes`.
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- **Response**: `204 No Content`; `404` khi không tồn tại.

#### 8.3. [POST] `/api/v1/alerts/{id}/escalate`
- **Mô tả**: Chuyển cấp cảnh báo cho một người dùng khác (thường là Manager). Body: `escalatedToUserId`, `reason`. Cảnh báo chuyển sang `Escalated`, người nhận được thông báo. **Response `201 Created`** (không bọc `ApiResponse`): `id`, `escalatedBy`, `escalatedByName`, `escalatedTo`, `escalatedToName`, `reason`, `escalatedAt`.
- **Phân quyền**: `SystemAdmin`, `Manager`, `Analyst`
- **Lỗi**: `400 INVALID_ESCALATION_TARGET` khi `escalatedToUserId` là chính người gọi (CHECK `CK_AlertEscalations_DifferentUsers`).

#### 8.3a. [POST] `/api/v1/alerts/trigger`
- **Mô tả**: Kích hoạt cảnh báo khẩn cấp cho một bất thường (hoặc tạo bất thường edge mới nếu không gửi `anomalyId`). Body: `anomalyId?`, `missionId?`, `towerId?`/`towerCode?`, `priority` (mặc định `Critical`), `latitude?`, `longitude?`. Cảnh báo mới ở trạng thái `Active`.
- **Phân quyền**: mọi người dùng đã xác thực
- **Lỗi**: `409 ALERT_ALREADY_ACTIVE` khi bất thường đã có một cảnh báo `Active` (mỗi bất thường tối đa một cảnh báo `Active`, index `UX_EmergencyAlerts_ActivePerAnomaly`). Cảnh báo đã `Escalated`, `Confirmed` hoặc `Dismissed` không chặn việc kích hoạt mới.

#### 8.4. [POST] `/api/v1/maintenance/tickets`
- **Mô tả**: Quản lý tạo phiếu sửa chữa / bảo trì từ một bất thường. Request **không có `towerId`**: cột điện của phiếu luôn là cột của bất thường (`detected_anomalies.tower_id`), không lưu riêng trên phiếu. Mã phiếu sinh tự động dạng `TCK-yyyyMMdd-NNN`.
- **Phân quyền**: `SystemAdmin`, `Manager`
- **Request Body**:
  ```json
  {
    "anomalyId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "technicianId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "priority": "High",
    "description": "Thay thế chuỗi cách điện vỡ tại pha B cột NPC_HP_01_001",
    "dueDate": "2026-11-01T17:00:00Z"
  }
  ```
  - `priority`: `Low`, `Medium`, `High`, `Emergency`. `description` bắt buộc, tối đa 1000 ký tự. `dueDate` không được ở quá khứ. `technicianId` phải là người dùng có vai trò Technician.
- **Response `201 Created`** (`data`): phiếu bảo trì, gồm `id`, `ticketCode`, `anomalyId`, `towerId` (suy ra từ bất thường), `managerId`, `technicianId`, `status`, `priority`, `description`, `dueDate`, `assignedAt`, `startedAt`, `resolvedAt`, `createdAt`, `tower`, `anomaly`, `manager`, `technician`, `maintenanceProofs`.

#### 8.5. [GET] `/api/v1/maintenance/tickets`
- **Mô tả**: Lấy danh sách phiếu bảo trì có phân trang, lọc theo trạng thái (`Open`, `InProgress`, `PendingVerification`, `Resolved`, `Closed`) và mức ưu tiên.
- **Query Params**: `pageIndex` (mặc định `0`), `pageSize` (mặc định `10`), `status`, `priority`

#### 8.6. [POST] `/api/v1/maintenance/tickets/{id}/proof`
- **Mô tả**: Kỹ thuật viên tải ảnh minh chứng sửa chữa (`multipart/form-data`: `file`, `technicianNotes?`). Mỗi tệp là một dòng `maintenance_proofs` (`proofType` = `Before`, `After` hoặc `Document`).
- **Phân quyền**: `Technician`, `MaintenanceTechnician`, `SystemAdmin`, `Manager`

#### 8.7. [PUT] `/api/v1/maintenance/tickets/{id}/close`
- **Mô tả**: Nghiệm thu và đóng phiếu sửa chữa. Phiếu phải có ít nhất một ảnh minh chứng. Hệ thống chuyển phiếu sang `Closed`, ghi `resolvedAt` và chuyển bất thường của phiếu sang `validationStatus = "Resolved"`. Không có bộ đếm lỗi hay bảng lịch sử tình trạng cột cần cập nhật: số bất thường đang mở của một cột được tính trực tiếp từ `detected_anomalies` (xem `GET /api/v1/towers/{id}/history`).
- **Phân quyền**: `SystemAdmin`, `Manager`

---

### MODULE 9: THÔNG BÁO REAL-TIME & SIGNALR (NOTIFICATIONSERVICE)

#### 9.1. [GET] `/api/v1/notifications`
- **Mô tả**: Lấy danh sách thông báo gửi đến người dùng hiện tại có phân trang.

#### 9.2. [GET] `/api/v1/notifications/unread-count`
- **Mô tả**: Lấy số lượng thông báo chưa đọc.

#### 9.3. [PUT] `/api/v1/notifications/{id}/read`
- **Mô tả**: Đánh dấu một thông báo là đã đọc.

#### 9.4. [WebSocket Hub] `/hubs/notifications`
- **Giao thức**: SignalR WebSocket
- **Sự kiện đẩy xuống Client**:
  - `ReceiveNotification`: Nhận thông báo vận hành mới (giao nhiệm vụ, yêu cầu phản hồi).
  - `ReceiveEmergencyAlert`: Nhận cảnh báo khẩn cấp tức thời (âm thanh & banner đỏ).
  - `MissionStatusChanged`: Cập nhật trạng thái nhiệm vụ realtime.

#### 9.5. [Dashboard UI] `/hangfire`
- **Mô tả**: Bảng điều khiển quản lý tác vụ nền và tác vụ định kỳ của Hangfire (Gửi email nhắc nhở quá hạn, đồng bộ dữ liệu).

---

### MODULE 10: MONITORING DASHBOARD & KIỂM TOÁN (OPERATIONSSERVICE)

#### 10.1. [GET] `/api/v1/monitor/summary`
- **Mô tả**: Lấy các chỉ số KPI vận hành tổng hợp: `totalMissions`, `pendingMissions`, `inProgressMissions`, `completedMissions`, `totalInspections`, `totalDefects`, `criticalDefects`. Không còn thống kê cột điện theo mức rủi ro (tính năng điểm sức khỏe / mức rủi ro đã bỏ ở ERD v2.2).

#### 10.2. [GET] `/api/v1/audit-logs`
- **Mô tả**: Truy vấn nhật ký kiểm toán hệ thống (`audit_logs`) có lọc theo bảng, ID bản ghi, nhân sự thao tác và khoảng thời gian.
- **Phân quyền**: `SystemAdmin`

---

### MODULE 11: BÁO CÁO QUẢN TRỊ (OPERATIONSSERVICE)

> [!NOTE]
> Theo ERD v2.2, báo cáo **không lưu tệp** và không lưu số liệu đóng băng. Bảng `reports` chỉ lưu phạm vi: `dateFrom`, `dateTo`, `regionId` và danh sách nhiệm vụ (`report_missions`). Không còn `transmissionLineId`, `substationId`, `pdfFileUrl`, `pdfFileSize`, `excelFileUrl`, `excelFileSize`. `defectCount` được **tính trực tiếp** mỗi lần đọc: số `detected_anomalies` chưa xóa, chưa bị thay thế (`supersededById IS NULL`), không ở trạng thái `Rejected`, nằm trong phạm vi báo cáo (theo nhiệm vụ nếu có danh sách nhiệm vụ; theo cột thuộc `regionId` hoặc khu vực con; theo `createdAt` trong `[dateFrom, dateTo]`). Báo cáo không có phạm vi nào thì `defectCount = 0`.
>
> **Đóng băng khi duyệt (mục 2.6)**: lúc `approve`, hệ thống ghi `reports.snapshot` (jsonb) gồm metadata báo cáo (người tạo, người duyệt theo họ tên, khu vực, khoảng thời gian), danh sách nhiệm vụ và danh sách bất thường tại thời điểm duyệt. Với báo cáo `approved` có snapshot, `defectCount` và tệp `/download` lấy từ snapshot nên **không đổi theo thời gian**, kể cả khi sau đó bất thường bị bác bỏ, xóa mềm hoặc gán lại cột. Báo cáo `draft`/`pending`, và báo cáo đã duyệt **trước** khi có tính năng này (`hasSnapshot = false`), vẫn tính trực tiếp như trên.

`type` và `status` trong response viết thường: `type` ∈ `defect`, `periodic`, `thermal`, `corridor`; `status` ∈ `draft`, `pending`, `approved`.

#### 11.1. [GET] `/api/v1/reports`
- **Mô tả**: Danh sách báo cáo có phân trang, tìm kiếm, lọc và sắp xếp.
- **Phân quyền**: Toàn bộ người dùng đã xác thực.
- **Query Params**: `page` (mặc định `1`), `pageSize` (mặc định `10`), `type`, `status`, `regionId`, `search`, `sortBy`, `sortOrder`
- **Response `200 OK`** (`data`): `items[]`, `pagination` (`page`, `pageSize`, `totalItems`, `totalPages`). Mỗi item: `id`, `code`, `title`, `type`, `status`, `createdAt`, `region` (`{ id, name }` hoặc `null`), `creator` (`{ id, fullName }`), `defectCount` (từ snapshot nếu đã duyệt), `hasSnapshot`.

#### 11.2. [GET] `/api/v1/reports/statistics`
- **Mô tả**: Thống kê số báo cáo theo loại và trạng thái.
- **Query Params**: `from`, `to`, `period`
- **Response `200 OK`** (`data`): `total`, `byType`, `byStatus`.

#### 11.3. [GET] `/api/v1/reports/{id}`
- **Mô tả**: Chi tiết báo cáo.
- **Response `200 OK`** (`data`): `id`, `code`, `title`, `type`, `status`, `description`, `createdAt`, `updatedAt`, `region` (`{ id, name }`), `creator`, `defectCount` (từ snapshot nếu báo cáo đã duyệt và có snapshot, ngược lại tính trực tiếp), `dateFrom`, `dateTo`, `rejectionReason`, `approvedBy`, `approvedAt`, `missions[]` (`id`, `missionCode`, `title`, `status`, `plannedStart`, đọc trực tiếp), `hasSnapshot`.

#### 11.4. [POST] `/api/v1/reports`
- **Mô tả**: Tạo báo cáo mới (trạng thái `draft`).
- **Phân quyền**: mọi vai trò (hằng `AdminManagerInspectorAnalyst`, gồm cả `Technician`, `MaintenanceTechnician`)
- **Request Body**:
  ```json
  {
    "title": "Báo cáo khiếm khuyết tháng 10 - Hải Phòng",
    "type": "defect",
    "regionId": "33333333-3333-3333-3333-333333333333",
    "missionIds": ["dddddddd-dddd-dddd-dddd-dddddddddddd"],
    "description": "Tổng hợp khiếm khuyết phát hiện trong tháng",
    "dateFrom": "2026-10-01T00:00:00+07:00",
    "dateTo": "2026-10-31T23:59:59+07:00"
  }
  ```
  - Bắt buộc: `title` (tối đa 255 ký tự), `type` (`defect`, `periodic`, `thermal`, `corridor`, không phân biệt hoa thường). Các trường còn lại tùy chọn.
- **Response `201 Created`**: `data` là chi tiết báo cáo (như mục 11.3).

#### 11.5. [PUT] `/api/v1/reports/{id}`
- **Mô tả**: Cập nhật báo cáo khi còn ở `draft`.
- **Phân quyền**: mọi vai trò (hằng `AdminManagerInspectorAnalyst`, gồm cả `Technician`, `MaintenanceTechnician`)
- **Request Body**: `title`, `description?`, `regionId?`, `missionIds?`, `dateFrom?`, `dateTo?` (không đổi `type`).

#### 11.6. [DELETE] `/api/v1/reports/{id}`
- **Mô tả**: Xóa mềm báo cáo khi còn ở `draft`.
- **Phân quyền**: mọi vai trò (hằng `AdminManagerInspectorAnalyst`, gồm cả `Technician`, `MaintenanceTechnician`)

#### 11.7. Luồng duyệt
- `[PUT] /api/v1/reports/{id}/submit`: `draft` → `pending`. Phân quyền: mọi vai trò (hằng `AdminManagerInspectorAnalyst`, gồm cả `Technician`, `MaintenanceTechnician`).
- `[PUT] /api/v1/reports/{id}/approve`: `pending` → `approved`, đồng thời ghi `snapshot`. Phân quyền: `SystemAdmin`, `Manager`. `approved` là trạng thái cuối: không sửa, xóa hay từ chối được nữa, nên snapshot luôn khớp metadata.
- `[PUT] /api/v1/reports/{id}/reject`: `pending` → `draft`, body `{ "reason": "..." }`. Phân quyền: `SystemAdmin`, `Manager`.

#### 11.8. [GET] `/api/v1/reports/{id}/download` và [POST] `/api/v1/reports/{id}/generate`
- **Mô tả**: Cả hai endpoint sinh tệp tại thời điểm gọi và stream về client, không lưu tệp. Báo cáo `approved` có snapshot được sinh **từ snapshot** (số liệu lúc duyệt); các báo cáo còn lại sinh từ dữ liệu hiện tại theo phạm vi báo cáo. Hai nguồn dùng chung bố cục PDF/Excel. `/generate` giữ lại để tương thích và tương đương `/download`.
- **Phân quyền**: mọi vai trò (hằng `AdminManagerInspectorAnalyst`, gồm cả `Technician`, `MaintenanceTechnician`). Manager chỉ tải được báo cáo trong phạm vi khu vực của mình; người dùng khác không tải được bản `draft` do người khác tạo.
- **Query Params**: `format` = `pdf` (mặc định) hoặc `excel` / `xlsx`.
- **Response `200 OK`**: nội dung tệp nhị phân (không bọc `ApiResponse`), `Content-Type` là `application/pdf` hoặc `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, kèm tên tệp trong `Content-Disposition`.
