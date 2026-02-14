import { ERROR_CODES, POLICY_RENEWAL_MONTHS } from '../constants';

describe('Constants', () => {
  describe('ERROR_CODES', () => {
    it('should have all required error codes', () => {
      expect(ERROR_CODES.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
      expect(ERROR_CODES.AUTH_INVALID).toBe('AUTH_INVALID');
      expect(ERROR_CODES.AUTH_FORBIDDEN).toBe('AUTH_FORBIDDEN');
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
      expect(ERROR_CODES.UPLOAD_FAILED).toBe('UPLOAD_FAILED');
      expect(ERROR_CODES.PROCESSING_FAILED).toBe('PROCESSING_FAILED');
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });

  describe('POLICY_RENEWAL_MONTHS', () => {
    it('should have correct renewal periods for policy types', () => {
      expect(POLICY_RENEWAL_MONTHS.Auto).toBe(12);
      expect(POLICY_RENEWAL_MONTHS.GMM).toBe(12);
      expect(POLICY_RENEWAL_MONTHS.Hogar).toBe(12);
      expect(POLICY_RENEWAL_MONTHS['Vida temporal']).toBe(12);
      expect(POLICY_RENEWAL_MONTHS['Vida permanente']).toBeNull();
    });
  });
});
