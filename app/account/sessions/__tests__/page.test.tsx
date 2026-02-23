import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionsPage from '../page';
import { sessionsApi } from '@/lib/api/sessionsApi';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/api/sessionsApi', () => ({
  sessionsApi: {
    listSessions: jest.fn(),
    revokeAllOtherSessions: jest.fn(),
    revokeSession: jest.fn(),
  },
}));

jest.mock('@/components/account/AccountCard', () => {
  return function MockAccountCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    );
  };
});

jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => 'hace 2 horas'),
}));

jest.mock('date-fns/locale', () => ({
  es: {},
}));

const mockSession = {
  sessionId: 'current',
  device: 'Chrome en Windows',
  lastActivity: '2026-02-23T10:00:00.000Z',
  isCurrent: true,
};

describe('SessionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sessionsApi.listSessions as jest.Mock).mockResolvedValue([mockSession]);
    (sessionsApi.revokeAllOtherSessions as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders loading state initially', () => {
    (sessionsApi.listSessions as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<SessionsPage />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('shows session card with device name after loading', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('Chrome en Windows')).toBeInTheDocument();
    });
  });

  it('shows last activity relative time', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('hace 2 horas')).toBeInTheDocument();
    });
  });

  it('shows "Sesión actual" badge', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('Sesión actual')).toBeInTheDocument();
    });
  });

  it('"Cerrar sesión" button is visible after load', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
      ).toBeInTheDocument();
    });
  });

  it('clicking "Cerrar sesión" button shows inline confirmation', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
    );

    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('clicking Cancelar hides the confirmation', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
    );
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.queryByRole('button', { name: /confirmar/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
    ).toBeInTheDocument();
  });

  it('clicking Confirmar calls revokeAllOtherSessions and redirects to /login', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(sessionsApi.revokeAllOtherSessions).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('error from revokeAllOtherSessions shows error message and does NOT redirect', async () => {
    (sessionsApi.revokeAllOtherSessions as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<SessionsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Error al cerrar sesión en todos los dispositivos')
      ).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
