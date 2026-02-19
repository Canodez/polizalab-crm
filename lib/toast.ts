import toast from 'react-hot-toast';

/**
 * Toast notification helpers
 * Provides consistent toast notifications across the app
 */

/**
 * Show success toast
 */
export function showSuccess(message: string): void {
  toast.success(message);
}

/**
 * Show error toast
 */
export function showError(message: string): void {
  toast.error(message);
}

/**
 * Show warning toast (using custom styling)
 */
export function showWarning(message: string): void {
  toast(message, {
    style: {
      background: '#f59e0b',
      color: '#fff',
    },
  });
}

/**
 * Show info toast
 */
export function showInfo(message: string): void {
  toast(message, {
    style: {
      background: '#3b82f6',
      color: '#fff',
    },
  });
}
