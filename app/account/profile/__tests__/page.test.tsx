import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import AccountProfilePage from '../page';
import { useAuth } from '@/lib/auth-context';
import { profileApi } from '@/lib/api-client';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  profileApi: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    getImageUploadUrl: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(() => ({
    getRootProps: jest.fn(() => ({})),
    getInputProps: jest.fn(() => ({})),
    isDragActive: false,
  })),
}));

jest.mock('date-fns', () => ({
  format: jest.fn(() => '15 Feb 2026'),
  formatDistanceToNow: jest.fn(() => 'hace 5 minutos'),
}));

jest.mock('date-fns/locale', () => ({ es: {} }));

jest.mock('@/components/ImagePreview', () => {
  return function MockImagePreview() {
    return <div data-testid="image-preview">ImagePreview</div>;
  };
});

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

jest.mock('@/lib/hooks/useDirtyFormGuard', () => ({
  useDirtyFormGuard: jest.fn(() => ({
    isDirty: false,
    markDirty: jest.fn(),
    markClean: jest.fn(),
    guardedNavigate: jest.fn(),
  })),
}));

const mockProfileData = {
  userId: 'test-user-123',
  email: 'test@example.com',
  nombre: 'Juan',
  apellido: 'Pérez',
  profileImage: null,
  profileImageUrl: null,
  createdAt: '2026-02-15T10:00:00Z',
  lastLoginAt: '2026-02-21T14:30:00Z',
};

const mockAuthValue = {
  user: {
    userId: 'test-user-123',
    email: 'test@example.com',
    emailVerified: true,
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  login: jest.fn(),
  logout: jest.fn(),
  refreshUser: jest.fn(),
  checkSession: jest.fn(),
};

describe('AccountProfilePage', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue(mockAuthValue);
    (profileApi.getProfile as jest.Mock).mockResolvedValue(mockProfileData);
    (profileApi.updateProfile as jest.Mock).mockResolvedValue({ success: true });
  });

  it('renders with profile data loaded', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Pérez')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(<AccountProfilePage />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('save button is disabled when no changes (isDirty=false)', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    expect(saveButton).toBeDisabled();
  });

  it('save button enabled after changing nombre', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const nombreInput = screen.getByDisplayValue('Juan');
    fireEvent.change(nombreInput, { target: { value: 'Carlos' } });

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('shows validation error for nombre < 2 chars', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const nombreInput = screen.getByDisplayValue('Juan');
    fireEvent.change(nombreInput, { target: { value: 'A' } });

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('El nombre debe tener al menos 2 caracteres')).toBeInTheDocument();
    });
  });

  it('save calls profileApi.updateProfile with correct data', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const nombreInput = screen.getByDisplayValue('Juan');
    fireEvent.change(nombreInput, { target: { value: 'Carlos' } });

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(profileApi.updateProfile).toHaveBeenCalledWith({
        nombre: 'Carlos',
        apellido: 'Pérez',
      });
    });
  });

  it('on save success: success message shown', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const nombreInput = screen.getByDisplayValue('Juan');
    fireEvent.change(nombreInput, { target: { value: 'Carlos' } });

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Perfil actualizado correctamente')).toBeInTheDocument();
    });
  });

  it('shows "Descartar cambios" button when dirty', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const nombreInput = screen.getByDisplayValue('Juan');
    fireEvent.change(nombreInput, { target: { value: 'Carlos' } });

    expect(screen.getByRole('button', { name: /descartar cambios/i })).toBeInTheDocument();
  });

  it('discard reverts to saved values', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const nombreInput = screen.getByDisplayValue('Juan');
    fireEvent.change(nombreInput, { target: { value: 'Carlos' } });

    const discardButton = screen.getByRole('button', { name: /descartar cambios/i });
    fireEvent.click(discardButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });
  });

  it('account info section renders email verified status', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('Email verificado')).toBeInTheDocument();
      expect(screen.getByText('Sí')).toBeInTheDocument();
    });
  });

  it('account info section renders createdAt date', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('Fecha de registro')).toBeInTheDocument();
      expect(screen.getByText('15 Feb 2026')).toBeInTheDocument();
    });
  });

  it('account info section renders userId hidden by default', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      expect(screen.getByText('••••••••••••••••')).toBeInTheDocument();
    });
  });

  it('shows user ID when show button is clicked', async () => {
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Mostrar ID de usuario')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Mostrar ID de usuario'));

    await waitFor(() => {
      expect(screen.getByText('test-user-123')).toBeInTheDocument();
    });
  });

  it('copies userId to clipboard', async () => {
    const mockWriteText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });

    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Copiar ID de usuario')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Copiar ID de usuario'));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('test-user-123');
    });
  });

  it('shows error on API failure', async () => {
    (profileApi.getProfile as jest.Mock).mockRejectedValue(new Error('Network error'));
    render(<AccountProfilePage />);
    await waitFor(() => {
      expect(screen.getByText('Error al cargar el perfil')).toBeInTheDocument();
    });
  });
});
