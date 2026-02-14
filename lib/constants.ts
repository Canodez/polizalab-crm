// API Error Codes
export const ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// Touch target minimum size (mobile-first)
export const MIN_TOUCH_TARGET_SIZE = 44; // pixels

// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Date formats
export const DATE_FORMAT = 'yyyy-MM-dd'; // ISO 8601 date format
export const TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"; // ISO 8601 timestamp

// Renewal thresholds (in days)
export const RENEWAL_THRESHOLDS = {
  OVERDUE: 0,
  THIRTY_DAYS: 30,
  SIXTY_DAYS: 60,
  NINETY_DAYS: 90,
} as const;

// Policy types with renewal rules
export const POLICY_RENEWAL_MONTHS = {
  Auto: 12,
  GMM: 12,
  Hogar: 12,
  'Vida temporal': 12,
  'Vida permanente': null,
} as const;
