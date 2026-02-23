import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PreferencesPage from '../page';
import { profileApi } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  profileApi: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
      this.name = 'ApiError';
    }
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

jest.mock('@/lib/hooks/useDirtyFormGuard', () => ({
  useDirtyFormGuard: jest.fn(() => ({
    isDirty: false,
    markDirty: jest.fn(),
    markClean: jest.fn(),
    guardedNavigate: jest.fn(),
  })),
}));

const mockProfileData = {
  userId: 'user-1',
  email: 'test@example.com',
  nombre: 'Juan',
  apellido: 'Pérez',
  profileImage: null,
  profileImageUrl: null,
  createdAt: '2026-02-01T00:00:00Z',
  preferredLanguage: 'es',
  timeZone: 'America/Mexico_City',
  emailNotificationsEnabled: true,
};

describe('PreferencesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileApi.getProfile as jest.Mock).mockResolvedValue(mockProfileData);
    (profileApi.updateProfile as jest.Mock).mockResolvedValue({ success: true });
  });

  it('loads existing preferences from profile', async () => {
    render(<PreferencesPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Ciudad de México, Guadalajara, Monterrey')).toBeInTheDocument();
    });
  });

  it('save button disabled when no changes', async () => {
    render(<PreferencesPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Ciudad de México, Guadalajara, Monterrey')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    expect(saveButton).toBeDisabled();
  });

  it('toggle notifications enables save button', async () => {
    render(<PreferencesPage />);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch'));

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('save calls profileApi.updateProfile with preference fields', async () => {
    render(<PreferencesPage />);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(profileApi.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredLanguage: 'es',
          timeZone: 'America/Mexico_City',
          emailNotificationsEnabled: false,
        })
      );
    });
  });

  it('on save success: shows toast and save becomes disabled', async () => {
    render(<PreferencesPage />);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(screen.getByText('Preferencias guardadas correctamente')).toBeInTheDocument();
    });
  });

  it('discard reverts to saved values', async () => {
    render(<PreferencesPage />);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    // Toggle off
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    // Discard
    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));

    await waitFor(() => {
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('shows loading state initially', () => {
    render(<PreferencesPage />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });
});
