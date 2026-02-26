import { render, screen, fireEvent } from '@testing-library/react';
import LeadCard from '../LeadCard';
import { Lead } from '@/lib/api/leadsApi';

jest.mock('date-fns', () => ({
  isToday: jest.fn(() => false),
  isTomorrow: jest.fn(() => false),
  parseISO: jest.fn((s: string) => new Date(s)),
  format: jest.fn(() => '15 mar 2026'),
}));

jest.mock('date-fns/locale', () => ({
  es: {},
}));

jest.mock('../LeadStatusBadge', () => {
  return function MockLeadStatusBadge({ status }: { status: string }) {
    return <span data-testid="lead-status-badge">{status}</span>;
  };
});

const baseLead: Lead = {
  tenantId: 'default',
  leadId: 'lead-1',
  userId: 'usr-1',
  createdByUserId: 'usr-1',
  fullName: 'Maria Garcia Lopez',
  phone: '+525512345678',
  status: 'NEW',
  productInterest: 'AUTO',
  timeline: [],
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

describe('LeadCard', () => {
  const mockOnClick = jest.fn();
  const mockOnConvert = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders lead name', () => {
    render(<LeadCard lead={baseLead} onClick={mockOnClick} />);
    expect(screen.getByText('Maria Garcia Lopez')).toBeInTheDocument();
  });

  it('renders phone number', () => {
    render(<LeadCard lead={baseLead} onClick={mockOnClick} />);
    expect(screen.getByText('+525512345678')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<LeadCard lead={baseLead} onClick={mockOnClick} />);
    expect(screen.getByTestId('lead-status-badge')).toHaveTextContent('NEW');
  });

  it('renders product interest badge', () => {
    render(<LeadCard lead={baseLead} onClick={mockOnClick} />);
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('renders initials from full name', () => {
    render(<LeadCard lead={baseLead} onClick={mockOnClick} />);
    expect(screen.getByText('MG')).toBeInTheDocument();
  });

  it('calls onClick with leadId when card is clicked', () => {
    render(<LeadCard lead={baseLead} onClick={mockOnClick} />);
    fireEvent.click(screen.getByText('Maria Garcia Lopez'));
    expect(mockOnClick).toHaveBeenCalledWith('lead-1');
  });

  it('shows convert button when onConvert provided and lead not converted', () => {
    render(<LeadCard lead={baseLead} onClick={mockOnClick} onConvert={mockOnConvert} />);
    expect(screen.getByText('Convertir a cliente')).toBeInTheDocument();
  });

  it('hides convert button when lead status is WON', () => {
    const wonLead = { ...baseLead, status: 'WON' as const };
    render(<LeadCard lead={wonLead} onClick={mockOnClick} onConvert={mockOnConvert} />);
    expect(screen.queryByText('Convertir a cliente')).not.toBeInTheDocument();
  });

  it('shows "Cliente convertido" when lead has convertedClientId', () => {
    const converted = { ...baseLead, convertedClientId: 'client-123' };
    render(<LeadCard lead={converted} onClick={mockOnClick} />);
    expect(screen.getByText('Cliente convertido')).toBeInTheDocument();
  });

  it('shows source when present', () => {
    const leadWithSource = { ...baseLead, source: 'WHATSAPP' as const };
    render(<LeadCard lead={leadWithSource} onClick={mockOnClick} />);
    expect(screen.getByText(/WhatsApp/)).toBeInTheDocument();
  });

  it('shows next action when present', () => {
    const leadWithAction = { ...baseLead, nextActionAt: '2026-03-15T00:00:00Z' };
    render(<LeadCard lead={leadWithAction} onClick={mockOnClick} />);
    expect(screen.getByText(/Prox. accion/)).toBeInTheDocument();
  });
});
