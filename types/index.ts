// User types
export interface User {
  userId: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  profileImage: string | null;
  createdAt: string;
}

// Policy types
export type PolicyType =
  | 'Auto'
  | 'GMM'
  | 'Hogar'
  | 'Vida temporal'
  | 'Vida permanente';

export type RenewalStatus =
  | '30_DAYS'
  | '60_DAYS'
  | '90_DAYS'
  | 'NOT_URGENT'
  | 'OVERDUE';

export type PolicyStatus = 'PROCESSED' | 'FAILED';

export interface Policy {
  policyId: string;
  userId: string;
  clienteNombre: string | null;
  clienteApellido: string | null;
  edad: number | null;
  tipoPoliza: PolicyType | null;
  cobertura: string | null;
  numeroPoliza: string | null;
  aseguradora: string | null;
  fechaInicio: string | null; // YYYY-MM-DD
  fechaFin: string | null; // YYYY-MM-DD
  fechaRenovacion: string | null; // YYYY-MM-DD
  renewalStatus: RenewalStatus;
  s3Key: string;
  status: PolicyStatus;
  errorMessage?: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// API Response types
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PresignedUrlResponse {
  presignedUrl: string;
  s3Key: string;
}

// Supported file types
export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
] as const;

export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
