import {
  POLICY_TYPES,
  POLICY_TYPE_VALUES,
  getPolicyTypeConfig,
} from '../policyTypes';

describe('policyTypes', () => {
  it('exports exactly 8 policy types', () => {
    expect(POLICY_TYPES).toHaveLength(8);
  });

  it('each type has required fields', () => {
    for (const type of POLICY_TYPES) {
      expect(type.value).toBeTruthy();
      expect(type.label).toBeTruthy();
      expect(type.iconName).toBeTruthy();
      expect(type.color).toBeTruthy();
      expect(type.textColor).toBeTruthy();
      expect(typeof type.hasRenewal).toBe('boolean');
    }
  });

  it('POLICY_TYPE_VALUES contains all values', () => {
    expect(POLICY_TYPE_VALUES).toHaveLength(8);
    expect(POLICY_TYPE_VALUES).toContain('Seguro de Autos');
    expect(POLICY_TYPE_VALUES).toContain('Vida permanente');
  });

  it('getPolicyTypeConfig returns correct config for known type', () => {
    const config = getPolicyTypeConfig('Seguro de Autos');
    expect(config).toBeDefined();
    expect(config?.iconName).toBe('TruckIcon');
    expect(config?.color).toBe('bg-blue-100');
    expect(config?.hasRenewal).toBe(true);
  });

  it('getPolicyTypeConfig returns undefined for unknown type', () => {
    expect(getPolicyTypeConfig('Tipo desconocido')).toBeUndefined();
  });

  it('Vida permanente has hasRenewal=false', () => {
    const config = getPolicyTypeConfig('Vida permanente');
    expect(config?.hasRenewal).toBe(false);
  });

  it('all types except Vida permanente have hasRenewal=true', () => {
    const withRenewal = POLICY_TYPES.filter((t) => t.value !== 'Vida permanente');
    for (const type of withRenewal) {
      expect(type.hasRenewal).toBe(true);
    }
  });
});
