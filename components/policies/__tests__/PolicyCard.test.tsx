import { render, screen, fireEvent } from '@testing-library/react';
import PolicyCard from '../PolicyCard';
import { Policy } from '@/lib/api/policiesApi';

jest.mock('date-fns', () => ({
  format: jest.fn(() => '1 ene 2027'),
}));

jest.mock('date-fns/locale', () => ({
  es: {},
}));

jest.mock('../RenewalBadge', () => {
  return function MockRenewalBadge({
    policyStatus,
    renewalStatus,
  }: {
    policyStatus?: string;
    renewalStatus?: string;
  }) {
    return <span data-testid="renewal-badge">{policyStatus || renewalStatus || ''}</span>;
  };
});

const basePolicy: Policy = {
  tenantId: 'default',
  policyId: 'pol-1',
  userId: 'usr-1',
  createdByUserId: 'usr-1',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  status: 'EXTRACTED',
  policyType: 'Seguro de Autos',
  insurer: 'AXA',
  policyNumber: 'MX-0001',
  insuredName: 'Juan García',
  endDate: '2027-01-01T00:00:00.000Z',
};

describe('PolicyCard', () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders insuredName', () => {
    render(<PolicyCard policy={basePolicy} onClick={mockOnClick} />);
    expect(screen.getByText('Juan García')).toBeInTheDocument();
  });

  it('renders insurer', () => {
    render(<PolicyCard policy={basePolicy} onClick={mockOnClick} />);
    expect(screen.getByText('AXA')).toBeInTheDocument();
  });

  it('renders policyNumber', () => {
    render(<PolicyCard policy={basePolicy} onClick={mockOnClick} />);
    expect(screen.getByText('Póliza: MX-0001')).toBeInTheDocument();
  });

  it('renders policyType label', () => {
    render(<PolicyCard policy={basePolicy} onClick={mockOnClick} />);
    expect(screen.getByText('Seguro de Autos')).toBeInTheDocument();
  });

  it('calls onClick with policyId when clicked', () => {
    render(<PolicyCard policy={basePolicy} onClick={mockOnClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockOnClick).toHaveBeenCalledWith('pol-1');
  });

  it('renders "Sin nombre" when no insuredName', () => {
    const policy: Policy = { ...basePolicy, insuredName: undefined };
    render(<PolicyCard policy={policy} onClick={mockOnClick} />);
    expect(screen.getByText('Sin nombre')).toBeInTheDocument();
  });

  it('renders "Tipo desconocido" when no policyType', () => {
    const policy: Policy = { ...basePolicy, policyType: undefined };
    render(<PolicyCard policy={policy} onClick={mockOnClick} />);
    expect(screen.getByText('Tipo desconocido')).toBeInTheDocument();
  });

  it('renders RenewalBadge', () => {
    render(<PolicyCard policy={basePolicy} onClick={mockOnClick} />);
    expect(screen.getByTestId('renewal-badge')).toBeInTheDocument();
  });

  it('shows renewal date when fechaRenovacion present', () => {
    const policy: Policy = { ...basePolicy, fechaRenovacion: '2027-06-01T00:00:00.000Z' };
    render(<PolicyCard policy={policy} onClick={mockOnClick} />);
    expect(screen.getByText(/Vence:/)).toBeInTheDocument();
  });

  it('does not render insurer row when insurer is missing', () => {
    const policy: Policy = { ...basePolicy, insurer: undefined };
    render(<PolicyCard policy={policy} onClick={mockOnClick} />);
    expect(screen.queryByText('AXA')).not.toBeInTheDocument();
  });
});
