import toast from 'react-hot-toast';
import { showSuccess, showError, showWarning, showInfo } from '../toast';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => {
  const mockToast = jest.fn();
  mockToast.success = jest.fn();
  mockToast.error = jest.fn();
  return {
    __esModule: true,
    default: mockToast,
  };
});

describe('Toast Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('showSuccess', () => {
    it('should call toast.success with message', () => {
      const message = 'Operation successful';
      showSuccess(message);
      
      expect(toast.success).toHaveBeenCalledWith(message);
    });
  });

  describe('showError', () => {
    it('should call toast.error with message', () => {
      const message = 'Operation failed';
      showError(message);
      
      expect(toast.error).toHaveBeenCalledWith(message);
    });
  });

  describe('showWarning', () => {
    it('should call toast with warning styling', () => {
      const message = 'Warning message';
      showWarning(message);
      
      expect(toast).toHaveBeenCalledWith(message, {
        style: {
          background: '#f59e0b',
          color: '#fff',
        },
      });
    });
  });

  describe('showInfo', () => {
    it('should call toast with info styling', () => {
      const message = 'Info message';
      showInfo(message);
      
      expect(toast).toHaveBeenCalledWith(message, {
        style: {
          background: '#3b82f6',
          color: '#fff',
        },
      });
    });
  });
});
