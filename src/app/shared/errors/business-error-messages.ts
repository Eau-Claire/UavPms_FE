import { HttpErrorResponse } from '@angular/common/http';

/**
 * One place that turns backend errors into Vietnamese messages.
 *
 * The OperationsService returns `ApiResponse { success, message, errorCode }`. Business rules use the
 * `errorCode` field and a message shaped as `"CODE: English text"`; 403 responses carry the generic code
 * `FORBIDDEN` with the real code in the message (`"REGION_MANAGEMENT_SCOPE_REQUIRED"` or
 * `"USER_NOT_ASSIGNED: ..."`). Known codes are mapped to Vietnamese here so pages never show the raw
 * English text for them.
 */
export const BUSINESS_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // --- Quyền và phạm vi ---
  REGION_MANAGEMENT_SCOPE_REQUIRED:
    'Bạn không có phạm vi quản lý khu vực này. Chỉ Quản trị hệ thống hoặc Quản lý được giao khu vực mới thực hiện được thao tác.',
  ASSESSMENT_ACCESS_DENIED: 'Bạn không có quyền thao tác trên hồ sơ đánh giá này.',
  ASSESSMENT_PERMISSION_REQUIRED: 'Vai trò của bạn không được phép thực hiện thao tác này trên hồ sơ đánh giá.',
  MISSION_ACCESS_DENIED: 'Bạn không có quyền truy cập nhiệm vụ này.',
  DRONE_ACCESS_DENIED: 'Bạn không có quyền thao tác trên UAV này.',
  TECHNICIAN_OR_MANAGER_ROLE_REQUIRED: 'Chỉ Kỹ thuật viên hoặc Quản lý mới được lập biên bản kiểm định UAV.',
  ACTIVE_USER_REQUIRED: 'Tài khoản của bạn đang bị khóa hoặc chưa kích hoạt, không thể thực hiện thao tác.',
  AUTHENTICATION_REQUIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  TOWER_OUTSIDE_MANAGEMENT_SCOPE: 'Có cột điện nằm ngoài khu vực bạn được quản lý.',
  TOWER_OUTSIDE_REGION_OR_SCOPE: 'Có cột điện nằm ngoài khu vực của nhiệm vụ hoặc ngoài phạm vi quản lý.',
  USER_NOT_ASSIGNED: 'Bạn không phải thành viên của nhiệm vụ này nên không thể xác nhận hoặc thao tác.',
  USER_NOT_ASSIGNED_TO_MISSION: 'Bạn không phải thành viên của nhiệm vụ này.',
  RECEIVER_NOT_ASSIGNED: 'Người nhận bàn giao không phải thành viên của nhiệm vụ.',

  // --- MF01: hồ sơ đánh giá tiền nhiệm vụ ---
  ASSESSMENT_CANCELLED: 'Hồ sơ đánh giá đã bị hủy trước đó, không thể thao tác tiếp.',
  ASSESSMENT_EXPIRED: 'Hồ sơ đánh giá đã hết hạn hiệu lực (khung giờ bay đã qua). Vui lòng lập hồ sơ mới.',
  ASSESSMENT_ALREADY_COMPLETED: 'Hồ sơ đánh giá đã được dùng để tạo nhiệm vụ bay, không thể thao tác tiếp.',
  ASSESSMENT_NOT_READY: 'Hồ sơ đánh giá chưa ở trạng thái READY.',
  ASSESSMENT_EXPIRED_OR_NOT_READY: 'Hồ sơ đánh giá đã hết hạn hoặc chưa ở trạng thái READY, không thể tạo nhiệm vụ.',
  INVALID_ASSESSMENT_STATUS: 'Trạng thái hồ sơ đánh giá không cho phép thao tác này.',
  ASSESSMENT_CONCURRENCY_CONFLICT: 'Hồ sơ đánh giá vừa được thay đổi ở phiên làm việc khác. Vui lòng tải lại dữ liệu.',
  ASSESSMENT_DRONE_MISMATCH: 'UAV này không thuộc danh sách UAV ứng viên của hồ sơ đánh giá.',
  REGION_INACTIVE: 'Khu vực của hồ sơ không còn hoạt động.',
  INVALID_PROPOSED_SCOPE: 'Cần chọn ít nhất một cột điện và không được trùng lặp.',
  INVALID_PLANNED_TIME: 'Thời điểm kết thúc phải sau thời điểm bắt đầu và ở tương lai.',
  TOWER_MISSING_GEOLOCATION: 'Có cột điện chưa có tọa độ, không thể đánh giá phạm vi bay.',
  INVALID_GEOMETRY: 'Vùng ranh giới (boundary) không hợp lệ.',
  TOWER_OUTSIDE_BOUNDARY: 'Có cột điện nằm ngoài vùng ranh giới đã vẽ.',
  SITE_FEASIBILITY_FAILED: 'Mặt bằng hành lang không đạt điều kiện an toàn.',
  IDEMPOTENCY_KEY_REUSED: 'Yêu cầu trùng khóa chống gửi lặp nhưng nội dung đã thay đổi. Vui lòng gửi lại.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu tương tự đang được xử lý. Vui lòng chờ giây lát rồi tải lại.',
  MISSION_REQUIRED: 'Cần cung cấp nhiệm vụ hợp lệ.',
  INVALID_MISSION_REFERENCE: 'Nhiệm vụ được tham chiếu không thuộc hồ sơ đánh giá này.',

  // --- MF01: kiểm định kỹ thuật UAV ---
  METRICS_REQUIRED: 'Biên bản kiểm định cần ít nhất một chỉ số đo kiểm. Vui lòng nhập kết quả checklist trước khi gửi.',
  DUPLICATE_METRIC: 'Biên bản kiểm định có chỉ số bị trùng lặp.',
  DRONE_ID_MISMATCH: 'Mã UAV trong biên bản không khớp với UAV đang kiểm định.',
  FC_NOT_REGISTERED: 'Flight Controller chưa được ghép nối với UAV nào. Vui lòng ghép nối trước khi kiểm định.',
  FC_DRONE_MISMATCH: 'Flight Controller đang kết nối thuộc về UAV khác với UAV cần kiểm định.',
  FC_UID_REQUIRED: 'Thiếu mã định danh (UID) của Flight Controller.',
  NO_VALID_TECHNICAL_INSPECTION:
    'UAV chưa có biên bản kiểm định kỹ thuật còn hiệu lực tại thời điểm bay. Kỹ thuật viên cần kiểm định UAV.',
  UAV_TECHNICAL_INSPECTION_EXPIRED: 'Biên bản kiểm định kỹ thuật của UAV đã hết hạn. Kỹ thuật viên cần kiểm định lại.',

  // --- MF02: tạo nhiệm vụ ---
  MULTIPLE_DRONES_NOT_SUPPORTED: 'Mỗi nhiệm vụ chỉ bay một UAV. Vui lòng chọn đúng một UAV chính.',
  DUPLICATE_PERSONNEL: 'Một nhân sự đang được chọn nhiều lần.',
  DUPLICATE_DRONE: 'Một UAV đang được chọn nhiều lần.',
  REQUIRED_MEMBER_REQUIRED: 'Nhiệm vụ cần ít nhất một thành viên bắt buộc xác nhận.',
  PERSONNEL_ASSIGNMENT_REQUIRED: 'Vui lòng chọn ít nhất một nhân sự cho nhiệm vụ.',
  DRONE_ASSIGNMENT_REQUIRED: 'Nhiệm vụ chưa có UAV. Vui lòng chọn UAV trước.',
  RESOURCE_NOT_IN_ASSESSMENT: 'Nhân sự hoặc UAV được chọn không còn là ứng viên đủ điều kiện của hồ sơ. Vui lòng đánh giá lại.',
  ASSIGNEE_ROLE_NOT_ELIGIBLE: 'Nhân sự được chọn không có vai trò hiện trường (Inspector/Analyst/Technician) hợp lệ.',
  ASSIGNEE_OUT_OF_SCOPE: 'Nhân sự được chọn không thuộc phạm vi khu vực của nhiệm vụ.',
  ASSIGNEE_NOT_ELIGIBLE: 'Nhân sự được chọn không đủ điều kiện tham gia nhiệm vụ.',
  ASSIGNEE_INACTIVE: 'Tài khoản nhân sự được chọn chưa kích hoạt hoặc đã bị khóa.',
  ASSIGNEE_REQUIRED: 'Vui lòng chọn nhân sự.',
  INVALID_CONFIRMATION_DEADLINE: 'Hạn xác nhận phải ở tương lai và không sau thời điểm bắt đầu bay dự kiến.',
  MANAGER_INSTRUCTIONS_TOO_LONG: 'Chỉ thị của quản lý tối đa 2.000 ký tự.',
  EMERGENCY_REASON_REQUIRED: 'Lý do khẩn cấp bắt buộc nhập tối thiểu 10 ký tự khi chọn mức ưu tiên Khẩn cấp.',

  // --- MF02: phân công ---
  ASSIGNMENT_ID_REQUIRED: 'Thiếu phân công cần thay thế.',
  ASSIGNEE_ALREADY_ASSIGNED: 'Nhân sự được chọn đã là thành viên của nhiệm vụ.',
  DUPLICATE_ASSIGNMENT: 'Nhân sự này đã có phân công đang hoạt động trong nhiệm vụ.',
  ASSIGNMENT_NOT_ACCEPTED: 'Thành viên chưa chấp nhận phân công.',
  POSTPONE_REASON_REQUIRED: 'Vui lòng nhập lý do xin hoãn.',
  MISSION_IMMUTABLE_AFTER_START: 'Nhiệm vụ đã bắt đầu bay (kể cả khi đang tạm dừng) nên không thể thay đổi nhân sự, UAV, cột hay mức ưu tiên.',

  // --- MF02/MF03: vòng đời và bắt đầu bay ---
  INVALID_MISSION_STATE: 'Trạng thái hiện tại của nhiệm vụ không cho phép thao tác này. Vui lòng tải lại nhiệm vụ.',
  REQUIRED_ACCEPTANCE_PENDING: 'Chưa thể bắt đầu bay: còn thành viên bắt buộc chưa chấp nhận nhiệm vụ.',
  MISSION_START_TOO_EARLY: 'Chưa đến khung giờ cho phép bắt đầu bay (sớm nhất 2 giờ trước giờ bay dự kiến).',
  DRONE_IN_USE: 'UAV đang được dùng ở nhiệm vụ khác hoặc đang bay/bàn giao, chưa thể bắt đầu.',
  HANDOVER_REJECTED: 'UAV đã bị từ chối khi bàn giao. Hãy đổi UAV hoặc ghi nhận bàn giao mới.',
  DRONE_NOT_AVAILABLE: 'UAV không ở trạng thái sẵn sàng (đang bảo trì, không khả dụng, thất lạc hoặc đang sử dụng).',
  DRONE_UNAVAILABLE: 'UAV không khả dụng.',
  DRONE_CRITICAL_HEALTH: 'UAV có sức khỏe kỹ thuật ở mức nguy hiểm (Critical), không được phép bay.',
  DRONE_HEALTH_UNKNOWN: 'UAV chưa có biên bản kiểm định kỹ thuật đạt. Kỹ thuật viên cần kiểm định UAV.',
  DRONE_UNSUITABLE: 'UAV không phù hợp với phạm vi bay của nhiệm vụ.',
  DRONE_ALREADY_RESERVED: 'UAV đã được giữ chỗ cho nhiệm vụ khác trong khung giờ này.',
  DRONE_NOT_ASSIGNED: 'UAV không thuộc nhiệm vụ này.',
  MISSION_CONCURRENCY_CONFLICT: 'Nhiệm vụ vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại.',
  SCOPE_REASSESSMENT_REQUIRED: 'Phạm vi nhiệm vụ đã thay đổi, cần đánh giá lại trước khi tiếp tục.',
  CHECK_IN_INVALID_STATE: 'Trạng thái nhiệm vụ không cho phép check-in.',
  CHECKIN_OUTSIDE_GEOFENCE: 'Vị trí check-in nằm ngoài vùng cho phép.',
  HANDOVER_INVALID_STATE: 'Trạng thái nhiệm vụ không cho phép bàn giao UAV.',
  RETURN_HANDOVER_INVALID_STATE: 'Chỉ hoàn trả UAV khi nhiệm vụ đang bay, đã hoàn thành hoặc đã hủy.',
  MISSION_NOT_FOUND: 'Không tìm thấy nhiệm vụ.',

  // --- Xung đột dữ liệu (409) ---
  RESOURCE_BOOKING_CONFLICT: 'Nhân sự hoặc UAV đã bị đặt lịch trùng khung giờ. Vui lòng chọn nguồn lực khác hoặc đánh giá lại.',
  DUPLICATE_CHECK_IN: 'Bạn đã check-in nhiệm vụ này rồi.',
  DUPLICATE_HANDOVER: 'UAV đang có một biên bản bàn giao chưa đóng.',
  DUPLICATE_RESOURCE: 'Bản ghi đã tồn tại.',
  CONCURRENCY_CONFLICT: 'Dữ liệu vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại.',
};

/** Codes that only say which exception type was thrown; the real code is then embedded in the message. */
const GENERIC_CODES = new Set(['FORBIDDEN', 'BUSINESS_RULE_VIOLATION', 'NOT_FOUND', 'UNAUTHORIZED', 'INTERNAL_ERROR']);

/** Codes that mean "someone else changed the data; reload and retry". */
const STALE_DATA_CODES = new Set(['CONCURRENCY_CONFLICT', 'ASSESSMENT_CONCURRENCY_CONFLICT', 'MISSION_CONCURRENCY_CONFLICT']);

const EMBEDDED_CODE = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?::\s*(.*))?$/s;
const VIETNAMESE_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export interface BackendError {
  /** HTTP status (0 when the server could not be reached, -1 when the error is not an HTTP error). */
  readonly status: number;
  /** Most specific business code found in `errorCode` or embedded at the start of `message`. */
  readonly code: string | null;
  /** Backend message without the leading `CODE:` prefix. */
  readonly message: string;
}

const objectOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Reads `{ status, code, message }` from an `HttpErrorResponse` (ApiResponse, ProblemDetails or plain text). */
export function readBackendError(err: unknown): BackendError {
  if (!(err instanceof HttpErrorResponse)) return { status: -1, code: null, message: '' };
  const raw = err.error;
  const body = objectOf(raw);
  const rawMessage =
    typeof raw === 'string' ? raw.trim() : textOf(body['message']) || textOf(body['detail']) || textOf(body['title']);
  const explicit = (textOf(body['errorCode']) || textOf(body['code'])).toUpperCase() || null;

  let message = rawMessage;
  let embedded: string | null = null;
  const match = EMBEDDED_CODE.exec(rawMessage);
  if (match) {
    embedded = match[1];
    message = (match[2] ?? '').trim();
  }

  let code = explicit;
  if (!code || GENERIC_CODES.has(code)) code = embedded ?? code;
  return { status: err.status, code, message };
}

/** Vietnamese text for a backend error code, or `null` when the code is unknown. */
export function businessErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return BUSINESS_ERROR_MESSAGES[code.trim().toUpperCase()] ?? null;
}

/** True for 409s caused by a concurrent change (the page should offer "reload"). */
export function isStaleDataError(err: unknown): boolean {
  const { status, code } = readBackendError(err);
  return status === 409 && (!code || STALE_DATA_CODES.has(code));
}

/**
 * Vietnamese message for any error from the backend.
 * Order: known business code → Vietnamese backend text → status-based text → `fallback`.
 * English backend text is never shown.
 */
export function describeHttpError(err: unknown, fallback: string): string {
  const { status, code, message } = readBackendError(err);
  if (status === -1) return fallback;
  if (status === 0) return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';

  const known = businessErrorMessage(code);
  if (known) return known;
  if (message && VIETNAMESE_CHARS.test(message)) return message;

  switch (status) {
    case 401:
      return BUSINESS_ERROR_MESSAGES['AUTHENTICATION_REQUIRED'];
    case 403:
      return 'Bạn không có quyền thực hiện thao tác này.';
    case 404:
      return 'Không tìm thấy dữ liệu yêu cầu (có thể đã bị xóa hoặc thay đổi). Vui lòng tải lại trang.';
    case 409:
      return BUSINESS_ERROR_MESSAGES['CONCURRENCY_CONFLICT'];
    default:
      return fallback;
  }
}
