import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PolicyDetailClient from '../PolicyDetailClient';
import { policiesApi } from '@/lib/api/policiesApi';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: 'pol-1' }),
}));

jest.mock('@/lib/api/policiesApi', () => ({
  policiesApi: {
    getPolicy: jest.fn(),
    patchPolicy: jest.fn(),
    ingest: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
    }
  },
}));

jest.mock('@/lib/hooks/useDirtyFormGuard', () => ({
  useDirtyFormGuard: jest.fn(() => ({
    markDirty: jest.fn(),
    markClean: jest.fn(),
    guardedNavigate: jest.fn((path, router) => router.push(path)),
  })),
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

jest.mock('@/components/policies/RenewalBadge', () => {
  return function MockRenewalBadge({ policyStatus }: { policyStatus?: string }) {
    return <span data-testid="renewal-badge">{policyStatus}</span>;
  };
});

jest.mock('../ReviewPanel', () => {
  return function MockReviewPanel({ onConfirm }: { onConfirm: (data: unknown) => void }) {
    return (
      <div data-testid="review-panel">
        <button onClick={() => onConfirm({})}>Confirmar póliza</button>
      </div>
    );
  };
});

jest.mock('date-fns', () => ({
  format: jest.fn((date: unknown, fmt: string) => {
    if (fmt === 'yyyy-MM-dd') return '2026-01-01';
    return '1 ene 2026';
  }),
}));

jest.mock('date-fns/locale', () => ({
  es: {},
}));

const basePolicy = {
  tenantId: 'default',
  policyId: 'pol-1',
  userId: 'usr-1',
  createdByUserId: 'usr-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  status: 'EXTRACTED' as const,
  policyType: 'Seguro de Autos',
  insurer: 'AXA',
  policyNumber: 'MX-001',
  insuredName: 'Juan García',
  startDate: '2026-01-01',
  endDate: '2027-01-01',
};

describe('PolicyDetailClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (policiesApi.getPolicy as jest.Mock).mockResolvedValue(basePolicy);
    (policiesApi.patchPolicy as jest.Mock).mockResolvedValue(basePolicy);
    (policiesApi.ingest as jest.Mock).mockResolvedValue({ policyId: 'pol-1', status: 'UPLOADED' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading state initially', () => {
    (policiesApi.getPolicy as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<PolicyDetailClient />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('renders policy data after loading (EXTRACTED state)', async () => {
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Juan García')).toBeInTheDocument();
      expect(screen.getByText('AXA')).toBeInTheDocument();
    });
  });

  it('shows not found message for 404', async () => {
    const { ApiError } = await import('@/lib/api/policiesApi');
    (policiesApi.getPolicy as jest.Mock).mockRejectedValue(new ApiError('Not found', 404));
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Póliza no encontrada')).toBeInTheDocument();
    });
  });

  it('shows error message for other API errors', async () => {
    const { ApiError } = await import('@/lib/api/policiesApi');
    (policiesApi.getPolicy as jest.Mock).mockRejectedValue(new ApiError('Server error', 500));
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('shows "Datos de la póliza" section for EXTRACTED status', async () => {
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Datos de la póliza')).toBeInTheDocument();
    });
  });

  it('shows Editar button in EXTRACTED read-only mode', async () => {
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    });
  });

  it('enters edit mode when Editar is clicked', async () => {
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });
  });

  it('calls patchPolicy on Confirmar (edit mode)', async () => {
    render(<PolicyDetailClient />);
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => screen.getByRole('button', { name: 'Confirmar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      expect(policiesApi.patchPolicy).toHaveBeenCalledWith('pol-1', expect.any(Object));
    });
  });

  it('shows VERIFIED banner for status=VERIFIED', async () => {
    (policiesApi.getPolicy as jest.Mock).mockResolvedValue({
      ...basePolicy,
      status: 'VERIFIED',
      verifiedAt: '2026-02-01T00:00:00Z',
    });
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Verificada')).toBeInTheDocument();
    });
  });

  it('shows processing spinner for PROCESSING status', async () => {
    (policiesApi.getPolicy as jest.Mock).mockResolvedValue({
      ...basePolicy,
      status: 'PROCESSING',
    });
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Analizando documento...')).toBeInTheDocument();
    });
  });

  it('shows ReviewPanel for NEEDS_REVIEW status', async () => {
    (policiesApi.getPolicy as jest.Mock).mockResolvedValue({
      ...basePolicy,
      status: 'NEEDS_REVIEW',
      needsReviewFields: ['policyNumber'],
      fieldConfidence: { policyNumber: 0.4 },
    });
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByTestId('review-panel')).toBeInTheDocument();
    });
  });

  it('shows FAILED error and retry button', async () => {
    (policiesApi.getPolicy as jest.Mock).mockResolvedValue({
      ...basePolicy,
      status: 'FAILED',
      lastError: 'Textract job failed',
    });
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Textract job failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reintentar análisis' })).toBeInTheDocument();
    });
  });

  it('calls ingest on retry button click', async () => {
    (policiesApi.getPolicy as jest.Mock).mockResolvedValue({
      ...basePolicy,
      status: 'FAILED',
      lastError: 'Textract failed',
    });
    render(<PolicyDetailClient />);
    await waitFor(() => screen.getByRole('button', { name: 'Reintentar análisis' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar análisis' }));
    });

    expect(policiesApi.ingest).toHaveBeenCalledWith('pol-1');
  });

  it('shows ReviewPanel section title "Revisión requerida"', async () => {
    (policiesApi.getPolicy as jest.Mock).mockResolvedValue({
      ...basePolicy,
      status: 'NEEDS_REVIEW',
    });
    render(<PolicyDetailClient />);
    await waitFor(() => {
      expect(screen.getByText('Revisión requerida')).toBeInTheDocument();
    });
  });

  it('back button navigates to /policies', async () => {
    render(<PolicyDetailClient />);
    await waitFor(() => screen.getByText('← Mis pólizas'));
    fireEvent.click(screen.getByText('← Mis pólizas'));
    expect(mockPush).toHaveBeenCalledWith('/policies');
  });
});
