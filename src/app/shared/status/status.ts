export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const statusTone = (status: string): StatusTone => {
  const value = (status || '').toUpperCase().replace(/[\s_-]/g, '');
  if (['READY', 'HEALTHY', 'AVAILABLE', 'ACCEPTED', 'COMPLETED', 'CONSUMED', 'FEASIBLE', 'PASSED', 'ELIGIBLE', 'ASSIGNED', 'RESOLVED', 'CLOSED', 'CONFIRMED'].includes(value)) return 'success';
  if (['WARNING', 'POSTPONED', 'RESERVED', 'PENDINGACCEPTANCE', 'INREVIEW', 'UNDERREVIEW', 'PENDINGVERIFICATION', 'ACKNOWLEDGED'].includes(value)) return 'warning';
  if (['CRITICAL', 'NOTREADY', 'NOT_READY', 'INCOMPLETE', 'FAILED', 'UNAVAILABLE', 'EMERGENCY', 'EXPIRED', 'NOTELIGIBLE', 'NOT_ELIGIBLE', 'SUSPENDED', 'REJECTED'].includes(value)) return 'danger';
  if (['INPROGRESS', 'IN_PROGRESS', 'PREPARING', 'EVALUATING', 'PENDING', 'DRAFT', 'OPEN', 'QUEUED', 'PROCESSING'].includes(value)) return 'info';
  return 'neutral';
};

const DOC_STATUS_MAP: Record<string, string> = {
  // PreMissionAssessment State Machine (Doc)
  EVALUATING: 'Evaluating',
  READY: 'Ready',
  NOTREADY: 'NotReady',
  NOT_READY: 'NotReady',
  INCOMPLETE: 'NotReady',
  COMPLETED: 'Completed',
  CONSUMED: 'Completed',
  CANCELLED: 'Cancelled',
  CANCELED: 'Cancelled',
  EXPIRED: 'Expired',

  // Mission State Machine (Doc)
  DRAFT: 'Draft',
  PENDINGACCEPTANCE: 'PendingAcceptance',
  PENDING_ACCEPTANCE: 'PendingAcceptance',
  POSTPONED: 'Postponed',
  CONFIRMED: 'Confirmed',
  INPROGRESS: 'InProgress',
  IN_PROGRESS: 'InProgress',
  SUSPENDED: 'Suspended',

  // MaintenanceTicket State Machine (Doc)
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  PENDINGVERIFICATION: 'PendingVerification',
  PENDING_VERIFICATION: 'PendingVerification',
  CLOSED: 'Closed',
  RESOLVED: 'Resolved',

  // DetectedAnomaly State Machine (Doc)
  PENDING: 'Pending',
  INREVIEW: 'InReview',
  IN_REVIEW: 'InReview',
  REJECTED: 'Rejected',

  // AIAnalysisRun State Machine (Doc)
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  FAILED: 'Failed',

  // EmergencyAlert State Machine (Doc)
  ACKNOWLEDGED: 'Acknowledged',

  // Binary check statuses
  PASS: 'PASS',
  PASSED: 'Passed',
  FAIL: 'FAIL',
};

export const statusLabel = (status: string): string => {
  if (!status) return '';
  const key = status.trim().toUpperCase().replace(/[\s-]/g, '_');
  const compactKey = key.replace(/_/g, '');
  if (DOC_STATUS_MAP[key]) return DOC_STATUS_MAP[key];
  if (DOC_STATUS_MAP[compactKey]) return DOC_STATUS_MAP[compactKey];
  return status;
};

