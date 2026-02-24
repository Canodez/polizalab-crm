import { render, screen } from '@testing-library/react';
import RenewalBadge from '../RenewalBadge';

describe('RenewalBadge', () => {
  // Processing states
  it('renders "Procesando" for policyStatus=CREATED', () => {
    render(<RenewalBadge policyStatus="CREATED" />);
    expect(screen.getByText('Procesando')).toBeInTheDocument();
  });

  it('renders "Procesando" for policyStatus=UPLOADED', () => {
    render(<RenewalBadge policyStatus="UPLOADED" />);
    expect(screen.getByText('Procesando')).toBeInTheDocument();
  });

  it('renders "Procesando" for policyStatus=PROCESSING', () => {
    render(<RenewalBadge policyStatus="PROCESSING" />);
    expect(screen.getByText('Procesando')).toBeInTheDocument();
  });

  // Terminal states
  it('renders "Error" for policyStatus=FAILED', () => {
    render(<RenewalBadge policyStatus="FAILED" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders "Verificada" for policyStatus=VERIFIED', () => {
    render(<RenewalBadge policyStatus="VERIFIED" />);
    expect(screen.getByText('Verificada')).toBeInTheDocument();
  });

  it('renders "Revisar" for policyStatus=NEEDS_REVIEW', () => {
    render(<RenewalBadge policyStatus="NEEDS_REVIEW" />);
    expect(screen.getByText('Revisar')).toBeInTheDocument();
  });

  // Renewal statuses
  it('renders "Vencida" for renewalStatus=OVERDUE', () => {
    render(<RenewalBadge renewalStatus="OVERDUE" />);
    expect(screen.getByText('Vencida')).toBeInTheDocument();
  });

  it('renders "30 días" for renewalStatus=30_DAYS', () => {
    render(<RenewalBadge renewalStatus="30_DAYS" />);
    expect(screen.getByText('30 días')).toBeInTheDocument();
  });

  it('renders "60 días" for renewalStatus=60_DAYS', () => {
    render(<RenewalBadge renewalStatus="60_DAYS" />);
    expect(screen.getByText('60 días')).toBeInTheDocument();
  });

  it('renders "90 días" for renewalStatus=90_DAYS', () => {
    render(<RenewalBadge renewalStatus="90_DAYS" />);
    expect(screen.getByText('90 días')).toBeInTheDocument();
  });

  it('renders "Al día" for renewalStatus=NOT_URGENT', () => {
    render(<RenewalBadge renewalStatus="NOT_URGENT" />);
    expect(screen.getByText('Al día')).toBeInTheDocument();
  });

  // Priority rules
  it('policyStatus takes priority over renewalStatus', () => {
    render(<RenewalBadge policyStatus="PROCESSING" renewalStatus="OVERDUE" />);
    expect(screen.getByText('Procesando')).toBeInTheDocument();
    expect(screen.queryByText('Vencida')).not.toBeInTheDocument();
  });

  it('EXTRACTED status falls through to renewalStatus', () => {
    render(<RenewalBadge policyStatus="EXTRACTED" renewalStatus="30_DAYS" />);
    expect(screen.getByText('30 días')).toBeInTheDocument();
  });

  it('renders nothing when no status provided', () => {
    const { container } = render(<RenewalBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for EXTRACTED with no renewalStatus', () => {
    const { container } = render(<RenewalBadge policyStatus="EXTRACTED" />);
    expect(container.firstChild).toBeNull();
  });
});
