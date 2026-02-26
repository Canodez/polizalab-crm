import { render, screen } from '@testing-library/react';
import LeadStatusBadge from '../LeadStatusBadge';

describe('LeadStatusBadge', () => {
  it('renders "Nuevo" for NEW status', () => {
    render(<LeadStatusBadge status="NEW" />);
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
  });

  it('renders "Contactado" for CONTACTED status', () => {
    render(<LeadStatusBadge status="CONTACTED" />);
    expect(screen.getByText('Contactado')).toBeInTheDocument();
  });

  it('renders "Cotizando" for QUOTING status', () => {
    render(<LeadStatusBadge status="QUOTING" />);
    expect(screen.getByText('Cotizando')).toBeInTheDocument();
  });

  it('renders "Ganado" for WON status', () => {
    render(<LeadStatusBadge status="WON" />);
    expect(screen.getByText('Ganado')).toBeInTheDocument();
  });

  it('renders "Perdido" for LOST status', () => {
    render(<LeadStatusBadge status="LOST" />);
    expect(screen.getByText('Perdido')).toBeInTheDocument();
  });

  it('applies correct color classes per status', () => {
    const { container: blueContainer } = render(<LeadStatusBadge status="NEW" />);
    expect(blueContainer.querySelector('.bg-blue-100')).toBeTruthy();

    const { container: greenContainer } = render(<LeadStatusBadge status="WON" />);
    expect(greenContainer.querySelector('.bg-green-100')).toBeTruthy();
  });
});
