import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import ProfilePage from '../page';
import { useAuth } from '@/lib/auth-context';
import { profileApi } from '@/lib/api-client';

// Mock dependencies
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
    constructor(message: string, public statusCode: number, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

describe('ProfilePage', () => {
  const mockPush = jest.fn();
  const mockProfileData = {
    userId: 'user-123',
    email: 'test@example.com',
    nombre: 'Juan',
    apellido: 'Pérez',
    profileImage: null,
    createdAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useAuth as jest.Mock).mockReturnValue({
      user: { email: 'test@example.com', sub: 'user-123' },
      isAuthenticated: true,
      isLoading: false,
    });
    (profileApi.getProfile as jest.Mock).mockResolvedValue(mockProfileData);
  });

  it('redirects to login if not authenticated', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('displays loading state initially', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isLoading: true,
    });

    render(<ProfilePage />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('loads and displays profile data', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(profileApi.getProfile).toHaveBeenCalled();
    });

    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pérez')).toBeInTheDocument();
  });

  it('displays error when profile loading fails', async () => {
    (profileApi.getProfile as jest.Mock).mockRejectedValue(
      new Error('Network error')
    );

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Error al cargar el perfil')).toBeInTheDocument();
    });
  });

  it('enables edit mode when edit button is clicked', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    fireEvent.click(editButton);

    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('allows editing nombre and apellido fields', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    await user.click(editButton);

    // Edit fields
    const nombreInput = screen.getByDisplayValue('Juan');
    const apellidoInput = screen.getByDisplayValue('Pérez');

    await user.clear(nombreInput);
    await user.type(nombreInput, 'Carlos');

    await user.clear(apellidoInput);
    await user.type(apellidoInput, 'García');

    expect(screen.getByDisplayValue('Carlos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('García')).toBeInTheDocument();
  });

  it('saves profile changes successfully', async () => {
    const user = userEvent.setup();
    (profileApi.updateProfile as jest.Mock).mockResolvedValue({ success: true });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    await user.click(editButton);

    // Edit fields
    const nombreInput = screen.getByDisplayValue('Juan');
    await user.clear(nombreInput);
    await user.type(nombreInput, 'Carlos');

    // Save
    const saveButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(profileApi.updateProfile).toHaveBeenCalledWith({
        nombre: 'Carlos',
        apellido: 'Pérez',
      });
    });

    expect(screen.getByText('Perfil actualizado correctamente')).toBeInTheDocument();
  });

  it('validates required fields before saving', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    await user.click(editButton);

    // Clear nombre field
    const nombreInput = screen.getByDisplayValue('Juan');
    await user.clear(nombreInput);

    // Try to save
    const saveButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(saveButton);

    expect(screen.getByText('Nombre y apellido son requeridos')).toBeInTheDocument();
    expect(profileApi.updateProfile).not.toHaveBeenCalled();
  });

  it('cancels edit mode and restores original values', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    await user.click(editButton);

    // Edit field
    const nombreInput = screen.getByDisplayValue('Juan');
    await user.clear(nombreInput);
    await user.type(nombreInput, 'Carlos');

    // Cancel
    const cancelButton = screen.getByRole('button', { name: /cancelar/i });
    await user.click(cancelButton);

    // Original value should be restored
    expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editar perfil/i })).toBeInTheDocument();
  });

  it('displays error when save fails', async () => {
    const user = userEvent.setup();
    (profileApi.updateProfile as jest.Mock).mockRejectedValue(
      new Error('Server error')
    );

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    // Enter edit mode and save
    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    await user.click(editButton);

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Error al guardar el perfil')).toBeInTheDocument();
    });
  });

  it('validates image file type', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    fireEvent.click(editButton);

    // Try to upload invalid file type
    const fileInput = screen.getByLabelText(/cambiar foto/i) as HTMLInputElement;
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });

    Object.defineProperty(fileInput, 'files', {
      value: [invalidFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText('Solo se permiten imágenes JPEG, PNG o WebP')).toBeInTheDocument();
    });
  });

  it('validates image file size', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /editar perfil/i });
    fireEvent.click(editButton);

    // Try to upload large file (6MB)
    const fileInput = screen.getByLabelText(/cambiar foto/i) as HTMLInputElement;
    const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.jpg', {
      type: 'image/jpeg',
    });

    Object.defineProperty(fileInput, 'files', {
      value: [largeFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText('La imagen no debe superar 5MB')).toBeInTheDocument();
    });
  });

  it('navigates back to home when volver button is clicked', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
    });

    const volverButton = screen.getByRole('button', { name: /volver/i });
    await user.click(volverButton);

    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
