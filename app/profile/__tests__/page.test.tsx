import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import ProfilePage from '../page';
import { useAuth } from '@/lib/auth-context';
import { profileApi } from '@/lib/api-client';
import { useDropzone } from 'react-dropzone';

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

jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(),
}));

describe('ProfilePage', () => {
  const mockPush = jest.fn();
  const mockProfileData = {
    userId: 'user-123',
    email: 'test@example.com',
    nombre: 'Juan',
    apellido: 'Pérez',
    profileImage: null,
    profileImageUrl: null,
    createdAt: '2024-01-01T00:00:00Z',
  };

  const mockDropzone = {
    getRootProps: jest.fn(() => ({})),
    getInputProps: jest.fn(() => ({})),
    isDragActive: false,
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
    (useDropzone as jest.Mock).mockReturnValue(mockDropzone);
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

  describe('File Picker Validation', () => {
    it('validates file type - rejects non-image files', async () => {
      const mockOnDrop = jest.fn();
      (useDropzone as jest.Mock).mockReturnValue({
        getRootProps: jest.fn(() => ({})),
        getInputProps: jest.fn(() => ({})),
        isDragActive: false,
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Get the onDrop callback from useDropzone
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      // Simulate dropping a text file (rejected)
      const textFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const rejectedFiles = [
        {
          file: textFile,
          errors: [{ code: 'file-invalid-type', message: 'File type not accepted' }],
        },
      ];

      onDrop([], rejectedFiles);

      await waitFor(() => {
        expect(screen.getByText('Solo se permiten imágenes JPEG o PNG')).toBeInTheDocument();
      });
    });

    it('validates file size - rejects files larger than 2MB', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Get the onDrop callback from useDropzone
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      // Simulate dropping a large file (rejected)
      const largeFile = new File(['x'.repeat(3 * 1024 * 1024)], 'large.jpg', {
        type: 'image/jpeg',
      });
      const rejectedFiles = [
        {
          file: largeFile,
          errors: [{ code: 'file-too-large', message: 'File is too large' }],
        },
      ];

      onDrop([], rejectedFiles);

      await waitFor(() => {
        expect(screen.getByText('La imagen no debe superar 2MB')).toBeInTheDocument();
      });
    });

    it('accepts valid image files (JPEG)', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Get the onDrop callback from useDropzone
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      // Simulate dropping a valid JPEG file
      const validFile = new File(['image content'], 'photo.jpg', {
        type: 'image/jpeg',
      });

      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: jest.fn(),
        onloadend: null as any,
        result: 'data:image/jpeg;base64,mockbase64data',
      };
      global.FileReader = jest.fn(() => mockFileReader) as any;

      onDrop([validFile], []);

      // Trigger the FileReader onloadend
      if (mockFileReader.readAsDataURL.mock.calls.length > 0) {
        mockFileReader.onloadend?.();
      }

      await waitFor(() => {
        const fileNames = screen.getAllByText('photo.jpg');
        expect(fileNames.length).toBeGreaterThan(0);
      });
    });

    it('accepts valid image files (PNG)', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Get the onDrop callback from useDropzone
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      // Simulate dropping a valid PNG file
      const validFile = new File(['image content'], 'photo.png', {
        type: 'image/png',
      });

      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: jest.fn(),
        onloadend: null as any,
        result: 'data:image/png;base64,mockbase64data',
      };
      global.FileReader = jest.fn(() => mockFileReader) as any;

      onDrop([validFile], []);

      // Trigger the FileReader onloadend
      if (mockFileReader.readAsDataURL.mock.calls.length > 0) {
        mockFileReader.onloadend?.();
      }

      await waitFor(() => {
        const fileNames = screen.getAllByText('photo.png');
        expect(fileNames.length).toBeGreaterThan(0);
      });
    });

    it('configures dropzone with correct accept types', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Check useDropzone was called with correct config
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      
      expect(dropzoneCall.accept).toEqual({
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
      });
      expect(dropzoneCall.maxSize).toBe(2 * 1024 * 1024); // 2MB
      expect(dropzoneCall.multiple).toBe(false);
    });

    it('disables file picker when not in edit mode', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Check useDropzone was called with disabled=true initially
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      expect(dropzoneCall.disabled).toBe(true);
    });

    it('enables file picker when in edit mode', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Initially disabled
      const initialDropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      expect(initialDropzoneCall.disabled).toBe(true);

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // After edit, should be enabled (disabled=false)
      // The component re-renders, so check the last call
      const lastCallIndex = (useDropzone as jest.Mock).mock.calls.length - 1;
      const lastDropzoneCall = (useDropzone as jest.Mock).mock.calls[lastCallIndex][0];
      expect(lastDropzoneCall.disabled).toBe(false);
    });
  });

  describe('S3 Upload and Image Display', () => {
    beforeEach(() => {
      // Mock XMLHttpRequest for S3 upload
      const mockXHR = {
        open: jest.fn(),
        send: jest.fn(),
        setRequestHeader: jest.fn(),
        upload: {
          addEventListener: jest.fn(),
        },
        addEventListener: jest.fn((event, handler) => {
          if (event === 'load') {
            mockXHR._loadHandler = handler;
          }
        }),
        status: 200,
        _loadHandler: null as any,
        timeout: 0,
      };
      (global as any).XMLHttpRequest = jest.fn(() => mockXHR);
    });

    it('uploads image to S3 successfully', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/key?signature=xyz';
      const mockS3Key = 'profile-images/user-123/photo.jpg';
      
      (profileApi.getImageUploadUrl as jest.Mock).mockResolvedValue({
        presignedUrl: mockPresignedUrl,
        s3Key: mockS3Key,
      });
      (profileApi.updateProfile as jest.Mock).mockResolvedValue({ success: true });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Get the onDrop callback
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      // Simulate file selection
      const validFile = new File(['image content'], 'photo.jpg', {
        type: 'image/jpeg',
      });

      const mockFileReader = {
        readAsDataURL: jest.fn(),
        onloadend: null as any,
        result: 'data:image/jpeg;base64,mockbase64data',
      };
      global.FileReader = jest.fn(() => mockFileReader) as any;

      onDrop([validFile], []);

      // Trigger FileReader onloadend
      if (mockFileReader.readAsDataURL.mock.calls.length > 0) {
        mockFileReader.onloadend?.();
      }

      await waitFor(() => {
        expect(screen.getByText('photo.jpg')).toBeInTheDocument();
      });

      // Click save on the image preview modal
      const saveButton = screen.getByRole('button', { name: /guardar/i });
      fireEvent.click(saveButton);

      // Wait for upload to complete
      await waitFor(() => {
        expect(profileApi.getImageUploadUrl).toHaveBeenCalledWith(
          'photo.jpg',
          'image/jpeg'
        );
      });

      // Simulate successful XHR upload
      const xhrInstance = (global as any).XMLHttpRequest.mock.results[0].value;
      if (xhrInstance._loadHandler) {
        xhrInstance._loadHandler();
      }

      await waitFor(() => {
        expect(profileApi.updateProfile).toHaveBeenCalled();
      });
    });

    it('handles S3 upload errors gracefully', async () => {
      (profileApi.getImageUploadUrl as jest.Mock).mockRejectedValue(
        new Error('Failed to get upload URL')
      );

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Get the onDrop callback
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      // Simulate file selection
      const validFile = new File(['image content'], 'photo.jpg', {
        type: 'image/jpeg',
      });

      const mockFileReader = {
        readAsDataURL: jest.fn(),
        onloadend: null as any,
        result: 'data:image/jpeg;base64,mockbase64data',
      };
      global.FileReader = jest.fn(() => mockFileReader) as any;

      onDrop([validFile], []);

      // Trigger FileReader onloadend
      if (mockFileReader.readAsDataURL.mock.calls.length > 0) {
        mockFileReader.onloadend?.();
      }

      await waitFor(() => {
        expect(screen.getByText('photo.jpg')).toBeInTheDocument();
      });

      // Click save on the image preview modal
      const saveButton = screen.getByRole('button', { name: /guardar/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/error al obtener url de subida/i)).toBeInTheDocument();
      });
    });

    it('displays profile image when profileImageUrl is provided', async () => {
      const mockProfileWithImage = {
        ...mockProfileData,
        profileImageUrl: 'https://s3.amazonaws.com/bucket/profile.jpg',
      };
      (profileApi.getProfile as jest.Mock).mockResolvedValue(mockProfileWithImage);

      render(<ProfilePage />);

      await waitFor(() => {
        const profileImage = screen.getByAltText('Foto de perfil');
        expect(profileImage).toBeInTheDocument();
        expect(profileImage).toHaveAttribute('src', mockProfileWithImage.profileImageUrl);
      });
    });

    it('shows initials when no profile image is available', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Check that initial 'J' is displayed (from "Juan")
      const avatarContainer = screen.getByText('J');
      expect(avatarContainer).toBeInTheDocument();
    });

    it('updates profile image URL in DynamoDB after upload', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/key?signature=xyz';
      const mockS3Key = 'profile-images/user-123/photo.jpg';
      
      (profileApi.getImageUploadUrl as jest.Mock).mockResolvedValue({
        presignedUrl: mockPresignedUrl,
        s3Key: mockS3Key,
      });
      (profileApi.updateProfile as jest.Mock).mockResolvedValue({ success: true });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      // Simulate file selection and upload
      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      const validFile = new File(['image content'], 'photo.jpg', {
        type: 'image/jpeg',
      });

      const mockFileReader = {
        readAsDataURL: jest.fn(),
        onloadend: null as any,
        result: 'data:image/jpeg;base64,mockbase64data',
      };
      global.FileReader = jest.fn(() => mockFileReader) as any;

      onDrop([validFile], []);

      if (mockFileReader.readAsDataURL.mock.calls.length > 0) {
        mockFileReader.onloadend?.();
      }

      await waitFor(() => {
        expect(screen.getByText('photo.jpg')).toBeInTheDocument();
      });

      // Click save
      const saveButton = screen.getByRole('button', { name: /guardar/i });
      fireEvent.click(saveButton);

      // Simulate successful upload
      const xhrInstance = (global as any).XMLHttpRequest.mock.results[0].value;
      if (xhrInstance._loadHandler) {
        xhrInstance._loadHandler();
      }

      await waitFor(() => {
        expect(profileApi.updateProfile).toHaveBeenCalledWith({
          nombre: 'Juan',
          apellido: 'Pérez',
        });
      });

      // Verify profile is reloaded to get updated image URL
      await waitFor(() => {
        expect(profileApi.getProfile).toHaveBeenCalledTimes(2); // Initial load + reload after save
      });
    });

    it('shows upload progress during S3 upload', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/key?signature=xyz';
      const mockS3Key = 'profile-images/user-123/photo.jpg';
      
      (profileApi.getImageUploadUrl as jest.Mock).mockResolvedValue({
        presignedUrl: mockPresignedUrl,
        s3Key: mockS3Key,
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Juan')).toBeInTheDocument();
      });

      // Enter edit mode and select file
      const editButton = screen.getByRole('button', { name: /editar perfil/i });
      fireEvent.click(editButton);

      const dropzoneCall = (useDropzone as jest.Mock).mock.calls[0][0];
      const onDrop = dropzoneCall.onDrop;

      const validFile = new File(['image content'], 'photo.jpg', {
        type: 'image/jpeg',
      });

      const mockFileReader = {
        readAsDataURL: jest.fn(),
        onloadend: null as any,
        result: 'data:image/jpeg;base64,mockbase64data',
      };
      global.FileReader = jest.fn(() => mockFileReader) as any;

      onDrop([validFile], []);

      if (mockFileReader.readAsDataURL.mock.calls.length > 0) {
        mockFileReader.onloadend?.();
      }

      await waitFor(() => {
        expect(screen.getByText('photo.jpg')).toBeInTheDocument();
      });

      // Click save
      const saveButton = screen.getByRole('button', { name: /guardar/i });
      fireEvent.click(saveButton);

      // Simulate progress event
      const xhrInstance = (global as any).XMLHttpRequest.mock.results[0].value;
      const progressHandler = xhrInstance.upload.addEventListener.mock.calls.find(
        (call: any) => call[0] === 'progress'
      )?.[1];

      if (progressHandler) {
        progressHandler({ lengthComputable: true, loaded: 50, total: 100 });
      }

      await waitFor(() => {
        expect(screen.getByText('Subiendo imagen...')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });
  });
});
