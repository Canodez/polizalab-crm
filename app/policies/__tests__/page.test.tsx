import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PoliciesPage from '../page';
import { policiesApi } from '@/lib/api/policiesApi';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/link', () => {
  return function MockLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  };
});

jest.mock('@/lib/api/policiesApi', () => ({
  policiesApi: {
    listPolicies: jest.fn(),
    getRenewals: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
    }
  },
}));

jest.mock('@/components/policies/PolicyCard', () => {
  return function MockPolicyCard({ policy, onClick }: { policy: { policyId: string; clienteNombre?: string }; onClick: (id: string) => void }) {
    return (
      <button onClick={() => onClick(policy.policyId)} data-testid={`card-${policy.policyId}`}>
        {policy.clienteNombre || 'Sin nombre'}
      </button>
    );
  };
});

const mockPolicies = [
  { policyId: 'p1', userId: 'u1', status: 'active', clienteNombre: 'Ana', createdAt: '2026-01-01' },
  { policyId: 'p2', userId: 'u1', status: 'active', clienteNombre: 'Luis', createdAt: '2026-01-01' },
];

const mockRenewals = [
  { policyId: 'p3', userId: 'u1', status: 'active', clienteNombre: 'Reno', renewalStatus: '30_DAYS', createdAt: '2026-01-01' },
];

describe('PoliciesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (policiesApi.listPolicies as jest.Mock).mockResolvedValue({ policies: mockPolicies, count: 2 });
    (policiesApi.getRenewals as jest.Mock).mockResolvedValue({ policies: mockRenewals, count: 1 });
  });

  it('shows skeleton while loading', () => {
    (policiesApi.listPolicies as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { container } = render(<PoliciesPage />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders policy cards after loading', async () => {
    render(<PoliciesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('card-p1')).toBeInTheDocument();
      expect(screen.getByTestId('card-p2')).toBeInTheDocument();
    });
  });

  it('shows empty state when no policies', async () => {
    (policiesApi.listPolicies as jest.Mock).mockResolvedValue({ policies: [], count: 0 });
    render(<PoliciesPage />);
    await waitFor(() => {
      expect(screen.getByText('No tienes pólizas aún')).toBeInTheDocument();
    });
  });

  it('shows error when API fails', async () => {
    (policiesApi.listPolicies as jest.Mock).mockRejectedValue(new Error('Network error'));
    render(<PoliciesPage />);
    await waitFor(() => {
      expect(screen.getByText('Error al cargar las pólizas')).toBeInTheDocument();
    });
  });

  it('clicking a card navigates to policy detail', async () => {
    render(<PoliciesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('card-p1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('card-p1'));
    expect(mockPush).toHaveBeenCalledWith('/policies/p1');
  });

  it('shows tab bar with "Todas" and "Próximas a vencer"', async () => {
    render(<PoliciesPage />);
    await waitFor(() => {
      expect(screen.getByText('Todas')).toBeInTheDocument();
      expect(screen.getByText('Próximas a vencer')).toBeInTheDocument();
    });
  });

  it('loads renewals lazily on tab switch', async () => {
    render(<PoliciesPage />);
    await waitFor(() => {
      expect(screen.getByText('Todas')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Próximas a vencer'));

    await waitFor(() => {
      expect(policiesApi.getRenewals).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('card-p3')).toBeInTheDocument();
    });
  });

  it('does not reload renewals on repeated tab switches', async () => {
    render(<PoliciesPage />);
    await waitFor(() => expect(screen.getByText('Todas')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Próximas a vencer'));
    await waitFor(() => expect(policiesApi.getRenewals).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Todas'));
    fireEvent.click(screen.getByText('Próximas a vencer'));

    expect(policiesApi.getRenewals).toHaveBeenCalledTimes(1);
  });

  it('shows "Nueva póliza" link', async () => {
    render(<PoliciesPage />);
    await waitFor(() => {
      expect(screen.getAllByText('Nueva póliza').length).toBeGreaterThan(0);
    });
  });
});
