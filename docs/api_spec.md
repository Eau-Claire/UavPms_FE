# 📋 TÀI LIỆU TẢI ĐẶC TẢ API (API SPECIFICATION) - UAV-PMS SYSTEM V1

Hệ thống UAV tích hợp AI để kiểm tra và quản lý bảo trì hạ tầng điện lực.

---

## 1. QUY ƯỚC CHUNG (GENERAL CONVENTIONS)

- **Base URL**: `http://localhost:5194/api/v1` hoặc `https://localhost:7155/api/v1`
- **Định dạng dữ liệu**: `application/json` cho các request/response thông thường, `multipart/form-data` cho các tác vụ tải lên file.
- **Xác thực (Authentication)**: Sử dụng JWT Token đính kèm ở Header:
  ```http
  Authorization: Bearer <access_token>
  ```
- **Chuẩn Mã trạng thái HTTP (HTTP Status Codes)**:
  - `200 OK`: Yêu cầu thành công.
  - `201 Created`: Tạo mới dữ liệu thành công.
  - `204 No Content`: Cập nhật/Xóa thành công, không có dữ liệu trả về.
  - `400 Bad Request`: Dữ liệu đầu vào không hợp lệ (mã lỗi validate).
  - `401 Unauthorized`: Token xác thực không hợp lệ hoặc hết hạn.
  - `403 Forbidden`: Người dùng không có vai trò phù hợp (RBAC).
  - `404 Not Found`: Không tìm thấy tài nguyên yêu cầu.
  - `500 Internal Server Error`: Lỗi hệ thống hoặc database.

---

## 2. PHÂN QUYỀN VAI TRÒ (ROLE-BASED ACCESS CONTROL - RBAC)

Các vai trò được cấu hình trong hệ thống:
- `SystemAdmin`: Quản trị hệ thống, CRUD người dùng, xem Audit Logs.
- `Manager`: Quản lý tài sản lưới điện, duyệt điều phối chuyến bay, tạo/đóng phiếu bảo trì, xem báo cáo thống kê.
- `Inspector`: Phi công bay UAV, xem danh sách chuyến bay được giao, tải lên log bay và hình ảnh kiểm tra, báo cáo sự cố hiện trường.
- `Analyst`: Nhà phân tích AI, duyệt/bác bỏ các lỗi do AI phát hiện, xử lý/leo thang cảnh báo khẩn cấp.
- `Technician`: Kỹ thuật viên hiện trường, nhận phiếu bảo trì, thực hiện sửa chữa, khai báo vật tư sử dụng, tải lên ảnh minh chứng sửa chữa.

---

## 3. DANH SÁCH ENDPOINTS CHI TIẾT

```mermaid
mindmap
  root((UAV-PMS API v1))
    Auth & Users
      POST /auth/login
      POST /auth/refresh-token
      GET /auth/me
      CRUD /users
    Grid Assets & GIS
      GET /regions
      GET /substations
      GET /lines
      GET /towers
      GET /towers/in-bbox
      GET /towers/import
      GET /assets/in-bbox
      GET /assets/{id}
    Missions & UAVs
      CRUD /uavs
      CRUD /missions
      PUT /missions/{id}/status
      POST /missions/{id}/flight-log
      POST /missions/{id}/media
    AI & Defects
      GET /anomalies/pending
      GET /anomalies/geojson
      PUT /anomalies/{id}/validate
    Alerts
      GET /alerts/active
      PUT /alerts/{id}/review
      POST /alerts/{id}/escalate
    Maintenance
      CRUD /maintenance/tickets
      PUT /maintenance/tickets/{id}/status
      POST /maintenance/tickets/{id}/proof
      POST /maintenance/tickets/{id}/materials
```

---

### MODULE 3.1: XÁC THỰC & QUẢN TRỊ NGƯỜI DÙNG (IDENTITY)

#### [POST] `/auth/login`
- **Mô tả**: Đăng nhập tài khoản bằng Username/Password, trả về cặp Access Token và Refresh Token.
- **Yêu cầu phân quyền**: Không cần (Public)
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "AdminPassword123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "d8a1f81d-6b58-45b7-a3c3-63023e3e2b2a",
    "expiresIn": 3600,
    "user": {
      "id": "e586b4a3-7649-43a9-a9a3-5c742f8c5cf1",
      "username": "admin",
      "fullName": "System Administrator",
      "email": "admin@uavpms.com",
      "roles": ["SystemAdmin"]
    }
  }
  ```
- **Response `400 Bad Request`**: Username hoặc Password sai.

#### [POST] `/auth/refresh-token`
- **Mô tả**: Sử dụng Refresh Token còn hạn để cấp lại Access Token mới.
- **Yêu cầu phân quyền**: Đăng nhập
- **Request Body**:
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "d8a1f81d-6b58-45b7-a3c3-63023e3e2b2a"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new...",
    "refreshToken": "f62b781a-6e58-41b9-a9c3-7303e3e2a2ba"
  }
  ```

#### [GET] `/auth/me`
- **Mô tả**: Lấy thông tin tài khoản hiện tại từ Token gửi lên.
- **Yêu cầu phân quyền**: Đăng nhập (Mọi vai trò)
- **Response `200 OK`**:
  ```json
  {
    "id": "e586b4a3-7649-43a9-a9a3-5c742f8c5cf1",
    "username": "admin",
    "fullName": "System Administrator",
    "email": "admin@uavpms.com",
    "phone": "0123456789",
    "status": "Active",
    "roles": ["SystemAdmin"]
  }
  ```

#### [POST] `/users`
- **Mô tả**: Tạo mới một tài khoản người dùng và gán vai trò.
- **Yêu cầu phân quyền**: `SystemAdmin`
- **Request Body**:
  ```json
  {
    "username": "technician1",
    "password": "Password@123",
    "fullName": "Nguyen Van A",
    "email": "nva@uavpms.com",
    "phone": "0987654321",
    "roleNames": ["Technician"]
  }
  ```
- **Response `201 Created`**: Trả về thông tin User vừa tạo kèm ID.

#### [GET] `/users/assignable`
- **Mô tả**: Lấy danh sách người dùng khả dụng để phân công chuyến bay (có vai trò `Inspector` và ở trạng thái hoạt động `Active`).
- **Yêu cầu phân quyền**: `SystemAdmin` hoặc `Manager`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Assignable users retrieved successfully.",
    "data": [
      {
        "id": "f186b4a3-7649-43a9-a9a3-5c742f8c5cf2",
        "username": "inspector1",
        "fullName": "Nguyen Van Inspector",
        "email": "inspector1@uavpms.com"
      }
    ]
  }
  ```
- **Response `401 Unauthorized`**: Token không hợp lệ hoặc hết hạn.
- **Response `403 Forbidden`**: Người dùng không có vai trò `SystemAdmin` hoặc `Manager`.

---

### MODULE 3.2: TÀI SẢN LƯỚI ĐIỆN & HỆ THỐNG GIS (ASSET & GIS)

#### [GET] `/towers/in-bbox`
- **Mô tả**: Lấy danh sách cột điện nằm trong vùng viewport bản đồ (Bounding Box) để hiển thị.
- **Yêu cầu phân quyền**: Đăng nhập (`SystemAdmin`, `Manager`, `Analyst`, `Inspector`)
- **Query Parameters**:
  - `minLat` (double, required): Vĩ độ nhỏ nhất (ví dụ: `20.950`)
  - `minLng` (double, required): Kinh độ nhỏ nhất (ví dụ: `105.750`)
  - `maxLat` (double, required): Vĩ độ lớn nhất (ví dụ: `21.050`)
  - `maxLng` (double, required): Kinh độ lớn nhất (ví dụ: `105.850`)
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "c7a8b9f0-d1e2-3456-789a-bcdef0123456",
      "lineAssetId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "towerCode": "TOW-N1-05",
      "latitude": 21.0084,
      "longitude": 105.7942,
      "transmissionLineName": "Đường dây 220kV Hòa Bình - Hà Đông",
      "assetsCount": 4
    }
  ]
  ```

#### [POST] `/towers`
- **Mô tả**: Tạo một cột điện mới, tự động khởi tạo đối tượng địa lý Point (PostGIS SRID 4326).
- **Yêu cầu phân quyền**: `Manager`
- **Request Body**:
  ```json
  {
    "lineAssetId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "towerCode": "TOW-N1-06",
    "latitude": 21.0095,
    "longitude": 105.7955
  }
  ```
- **Response `201 Created`**

#### [POST] `/towers/import`
- **Mô tả**: Import danh sách cột điện truyền tải hàng loạt từ file Excel. Tự động tạo mặc định các loại thiết bị (`Assets`) gắn kèm cho mỗi cột.
- **Yêu cầu phân quyền**: `Manager`
- **Request Body**: `multipart/form-data` chứa file Excel.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "importedCount": 45,
    "createdAssetsCount": 180
  }
  ```

#### [GET] `/assets/{id}`
- **Mô tả**: Xem thông tin chi tiết một thiết bị kèm theo Điểm sức khỏe (`Health Score`), Nhãn rủi ro (`Risk Level`) và danh sách sự cố liên kết.
- **Yêu cầu phân quyền**: Đăng nhập (Mọi vai trò)
- **Response `200 OK`**:
  ```json
  {
    "id": "b0f81d8a-6b58-45b7-a3c3-63023e3e2b2a",
    "towerId": "c7a8b9f0-d1e2-3456-789a-bcdef0123456",
    "assetType": "Insulator",
    "assetCode": "INS-TOW05-01",
    "status": "Operational",
    "currentHealthScore": 72.5,
    "riskLevel": "Medium Risk",
    "lastInspectedAt": "2026-06-15T08:00:00Z",
    "towerCode": "TOW-N1-05",
    "activeAnomalies": [
      {
        "id": "f5b81d8a-6e58-41b9-a9c3-7303e3e2a2ba",
        "categoryName": "Insulator Damage",
        "confidenceScore": 0.89,
        "validationStatus": "Confirmed",
        "createdAt": "2026-06-16T14:30:00Z"
      }
    ]
  }
  ```

---

### MODULE 3.3: QUẢN LÝ CHUYẾN BAY & NẠP DỮ LIỆU HIỆN TRƯỜNG (MISSION)

#### [POST] `/missions`
- **Mô tả**: Manager tạo kế hoạch chuyến bay, phân công Inspector, chỉ định thiết bị UAV và các tuyến dây cần kiểm tra.
- **Yêu cầu phân quyền**: `Manager`
- **Request Body**:
  ```json
  {
    "missionCode": "MIS-20260617-01",
    "managerId": "e586b4a3-7649-43a9-a9a3-5c742f8c5cf1",
    "inspectorId": "f186b4a3-7649-43a9-a9a3-5c742f8c5cf2",
    "uavId": "d186b4a3-7649-43a9-a9a3-5c742f8c5cf3",
    "scheduledStartAt": "2026-06-18T08:00:00Z",
    "description": "Bay kiểm tra định kỳ tuyến dây Hòa Bình - Hà Đông",
    "targetLineIds": [
      "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
    ]
  }
  ```
- **Response `201 Created`**

#### [PUT] `/missions/{id}/status`
- **Mô tả**: Cập nhật trạng thái vòng đời chuyến bay: `Scheduled` -> `InProgress` (Khi Inspector cất cánh) -> `Completed` (Khi kết thúc bay).
- **Yêu cầu phân quyền**: `Inspector` hoặc `Manager`
- **Request Body**:
  ```json
  {
    "status": "InProgress"
  }
  ```
- **Response `204 No Content`**

#### [POST] `/missions/{id}/flight-log`
- **Mô tả**: Tải lên log chuyến bay từ drone (chứa tệp chuỗi GPS track định dạng JSONB để vẽ đường bay trên bản đồ).
- **Yêu cầu phân quyền**: `Inspector`
- **Request Body**:
  ```json
  {
    "gpsTrack": "[{\"lat\": 21.0084, \"lng\": 105.7942, \"alt\": 120, \"bat\": 95}, ...]",
    "minBatteryRecorded": 22.5,
    "maxAltitudeM": 150.0,
    "flightDurationSeconds": 1800,
    "connectionStatus": "Good"
  }
  ```
- **Response `200 OK`**

#### [POST] `/missions/{id}/media`
- **Mô tả**: Tải lên hình ảnh chụp từ UAV kiểm tra. File ảnh sẽ được tự động phân tích EXIF để trích xuất tọa độ GPS và gắn liên kết tự động tới `AssetId` nằm gần nhất trên bản đồ.
- **Yêu cầu phân quyền**: `Inspector`
- **Request Body**: `multipart/form-data`
  - `file` (File): Ảnh độ phân giải cao
  - `assetId` (Guid, optional): Chọn tay thiết bị nếu ảnh không chứa tọa độ GPS.
- **Response `200 OK`**:
  ```json
  {
    "mediaId": "d586b4a3-7649-43a9-a9a3-5c742f8c5cf9",
    "fileUrl": "/uav_storage/images/20260617/img_0942.jpg",
    "latitude": 21.00845,
    "longitude": 105.79425,
    "matchedAssetId": "b0f81d8a-6b58-45b7-a3c3-63023e3e2b2a",
    "triggerAiInspection": true
  }
  ```

---

### MODULE 3.4: DUYỆT LỖI AI & THẨM ĐỊNH (AI ANOMALY DETECTION)

#### [GET] `/anomalies/pending`
- **Mô tả**: Lấy danh sách lỗi do AI (YOLOv8) phát hiện đang ở trạng thái `Pending` chờ Analyst thẩm định lại.
- **Yêu cầu phân quyền**: `Analyst`
- **Query Parameters**: Phân trang (`pageIndex`, `pageSize`).
- **Response `200 OK`**:
  ```json
  {
    "totalCount": 12,
    "items": [
      {
        "id": "f5b81d8a-6e58-41b9-a9c3-7303e3e2a2ba",
        "mediaUrl": "/uav_storage/images/20260617/img_0942.jpg",
        "assetCode": "INS-TOW05-01",
        "categoryName": "Insulator Damage",
        "boundingBox": "{\"x\": 120, \"y\": 80, \"w\": 45, \"h\": 60}",
        "confidenceScore": 0.89,
        "validationStatus": "Pending",
        "createdAt": "2026-06-17T14:30:00Z"
      }
    ]
  }
  ```

#### [GET] `/anomalies/geojson`
- **Mô tả**: Lấy danh sách toàn bộ các lỗi đang có hiệu lực (`Confirmed` và chưa được `Resolved`) dưới định dạng GeoJSON để vẽ marker cluster / heatmap lên bản đồ.
- **Yêu cầu phân quyền**: Đăng nhập (Mọi vai trò)
- **Response `200 OK`**:
  ```json
  {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [105.7942, 21.0084]
        },
        "properties": {
          "anomalyId": "f5b81d8a-6e58-41b9-a9c3-7303e3e2a2ba",
          "assetCode": "INS-TOW05-01",
          "category": "Insulator Damage",
          "severity": 0.8,
          "towerCode": "TOW-N1-05"
        }
      }
    ]
  }
  ```

#### [PUT] `/anomalies/{id}/validate`
- **Mô tả**: Analyst duyệt kết quả lỗi của AI.
  - Nếu `Confirmed`: Xác nhận lỗi chính xác, tự động làm giảm điểm sức khỏe của thiết bị và đề xuất phiếu bảo trì.
  - Nếu `Rejected`: Đánh dấu là nhận diện sai, điểm sức khỏe thiết bị giữ nguyên.
- **Yêu cầu phân quyền**: `Analyst`
- **Request Body**:
  ```json
  {
    "status": "Confirmed", // Hoặc "Rejected"
    "analystNotes": "Bát sứ bị mẻ cạnh lớn ở mặt dưới, cần thay thế sớm."
  }
  ```
- **Response `204 No Content`**

---

### MODULE 3.5: CẢNH BÁO KHẨN CẤP REAL-TIME (EMERGENCY ALERT)

#### [GET] `/alerts/active`
- **Mô tả**: Xem danh sách các cảnh báo khẩn cấp đang diễn ra (do Edge AI/Cloud AI phát hiện các lỗi nguy hại trực tiếp như cháy nổ, đổ cột điện).
- **Yêu cầu phân quyền**: Đăng nhập (`Manager`, `Analyst`)
- **Response `200 OK`**:
  ```json
  [
    {
      "id": "a9b81d8a-6e58-41b9-a9c3-7303e3e2a2ba",
      "anomalyId": "f5b81d8a-6e58-41b9-a9c3-7303e3e2a2ba",
      "assetCode": "INS-TOW05-01",
      "status": "Active",
      "priority": "Critical",
      "triggeredAt": "2026-06-17T15:00:00Z"
    }
  ]
  ```

#### [PUT] `/alerts/{id}/review`
- **Mô tả**: Cho phép Analyst xác nhận nhanh sự cố khẩn cấp (xác nhận lỗi nghiêm trọng hoặc bác bỏ báo cáo giả).
- **Yêu cầu phân quyền**: `Analyst`
- **Request Body**:
  ```json
  {
    "status": "Confirmed", // Hoặc "Dismissed"
    "notes": "Xác nhận cháy rừng gần hành lang lưới điện."
  }
  ```
- **Response `204 No Content`**

#### [POST] `/alerts/{id}/escalate`
- **Mô tả**: Analyst leo thang cảnh báo khẩn cấp lên các cấp Manager liên quan để điều phối khắc phục lập tức.
- **Yêu cầu phân quyền**: `Analyst`
- **Request Body**:
  ```json
  {
    "escalatedToUserId": "e586b4a3-7649-43a9-a9a3-5c742f8c5cf1",
    "reason": "Độ trễ xử lý quá lâu, khu vực cháy lan rộng sát trạm biến áp."
  }
  ```
- **Response `201 Created`**

---

### MODULE 3.6: PHIẾU BẢO TRÌ & LOG VẬT TƯ (MAINTENANCE)

#### [POST] `/maintenance/tickets`
- **Mô tả**: Manager tạo phiếu sửa chữa bảo trì, gán cho Technician phụ trách xử lý thiết bị gặp lỗi.
- **Yêu cầu phân quyền**: `Manager`
- **Request Body**:
  ```json
  {
    "anomalyId": "f5b81d8a-6e58-41b9-a9c3-7303e3e2a2ba",
    "assetId": "b0f81d8a-6b58-45b7-a3c3-63023e3e2b2a",
    "technicianId": "a186b4a3-7649-43a9-a9a3-5c742f8c5cf5",
    "priority": "High",
    "description": "Thay thế bát cách điện bị hỏng theo khuyến nghị của phân tích AI",
    "dueDate": "2026-06-20T17:00:00Z"
  }
  ```
- **Response `201 Created`**: Trả về Ticket vừa tạo chứa `ticketCode` tự động sinh (ví dụ: `TCK-20260617-001`).

#### [PUT] `/maintenance/tickets/{id}/status`
- **Mô tả**: Cập nhật trạng thái phiếu bảo trì từ phía Technician: `Assigned` -> `InProgress` (Bắt đầu sửa chữa tại cột) -> `PendingVerification` (Chờ nghiệm thu sau khi nạp minh chứng).
- **Yêu cầu phân quyền**: `Technician`
- **Request Body**:
  ```json
  {
    "status": "InProgress"
  }
  ```
- **Response `204 No Content`**

#### [POST] `/maintenance/tickets/{id}/proof`
- **Mô tả**: Technician tải lên ảnh chụp thiết bị sau khi đã thay thế/sửa chữa xong kèm theo ghi chú báo cáo hiện trường.
- **Yêu cầu phân quyền**: `Technician`
- **Request Body**: `multipart/form-data`
  - `file` (File): Ảnh minh chứng sau sửa chữa
  - `technicianNotes` (string): Báo cáo công việc
- **Response `200 OK`**

#### [POST] `/maintenance/tickets/{id}/materials`
- **Mô tả**: Technician khai báo danh sách vật tư kỹ thuật đã tiêu hao trong quá trình sửa chữa thiết bị.
- **Yêu cầu phân quyền**: `Technician`
- **Request Body**:
  ```json
  {
    "componentName": "Bát sứ cách điện 220kV",
    "componentCode": "VTS-220-BS",
    "quantityUsed": 1,
    "unit": "Cái",
    "fieldObservations": "Đã thay thế bát sứ bị mẻ, kiểm tra dòng rò an toàn."
  }
  ```
- **Response `200 OK`**

#### [PUT] `/maintenance/tickets/{id}/close`
- **Mô tả**: Manager xem xét minh chứng hình ảnh và vật tư đã sử dụng. Nếu đạt yêu cầu, phê duyệt đóng phiếu (Trạng thái chuyển sang `Resolved`), lỗi liên quan tự động chuyển sang `Resolved`, và hệ thống tự động chạy ngầm dịch vụ tính toán lại điểm sức khỏe thiết bị để khôi phục chỉ số sức khỏe của `Asset` đó.
- **Yêu cầu phân quyền**: `Manager`
- **Response `204 No Content`**
