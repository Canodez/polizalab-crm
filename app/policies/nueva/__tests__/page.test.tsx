import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import NuevaPolicyPage from '../page';
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
    getUploadUrl: jest.fn(),
    ingest: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
    }
  },
}));

// Capture the onDrop callback from useDropzone
let capturedOnDrop: ((accepted: File[], rejected: unknown[]) => void) | null = null;

jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(({ onDrop }) => {
    capturedOnDrop = onDrop;
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({}),
      isDragActive: false,
    };
  }),
}));

describe('NuevaPolicyPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnDrop = null;
    mockPush.mockClear();
  });

  it('renders dropzone and upload button', () => {
    render(<NuevaPolicyPage />);
    expect(screen.getByRole('button', { name: 'Subir póliza' })).toBeInTheDocument();
    expect(screen.getByText(/Arrastra tu archivo/)).toBeInTheDocument();
  });

  it('back link points to /policies', () => {
    render(<NuevaPolicyPage />);
    const link = screen.getByRole('link', { name: /Mis pólizas/i });
    expect(link).toHaveAttribute('href', '/policies');
  });

  it('upload button is disabled with no file selected', () => {
    render(<NuevaPolicyPage />);
    const btn = screen.getByRole('button', { name: 'Subir póliza' });
    expect(btn).toBeDisabled();
  });

  it('shows file name after file is selected via onDrop', async () => {
    const mockFile = new File(['pdf content'], 'poliza.pdf', { type: 'application/pdf' });
    render(<NuevaPolicyPage />);

    await act(async () => {
      capturedOnDrop!([mockFile], []);
    });

    expect(screen.getByText('poliza.pdf')).toBeInTheDocument();
  });

  it('shows file-too-large error on rejected file', async () => {
    render(<NuevaPolicyPage />);

    await act(async () => {
      capturedOnDrop!([], [{ errors: [{ code: 'file-too-large' }] }]);
    });

    expect(screen.getByText('El archivo no debe superar 20MB')).toBeInTheDocument();
  });

  it('shows file-invalid-type error on rejected file', async () => {
    render(<NuevaPolicyPage />);

    await act(async () => {
      capturedOnDrop!([], [{ errors: [{ code: 'file-invalid-type' }] }]);
    });

    expect(screen.getByText('Solo se permiten archivos PDF, PNG o JPG')).toBeInTheDocument();
  });

  it('calls ingest and navigates to detail page after successful upload', async () => {
    const mockFile = new File(['pdf'], 'pol.pdf', { type: 'application/pdf' });

    (policiesApi.getUploadUrl as jest.Mock).mockResolvedValue({
      policyId: 'pol-abc123',
      s3KeyOriginal: 'policies/default/usr-1/pol-abc123/original.pdf',
      presignedPutUrl: 'https://s3.example.com/upload',
      expiresIn: 300,
    });
    (policiesApi.ingest as jest.Mock).mockResolvedValue({ policyId: 'pol-abc123', status: 'UPLOADED' });

    // Mock XHR — immediately trigger 'load' with status 200
    const xhrMock = {
      upload: { addEventListener: jest.fn() },
      addEventListener: jest.fn(),
      open: jest.fn(),
      setRequestHeader: jest.fn(),
      send: jest.fn(),
      status: 200,
      timeout: 0,
    };
    xhrMock.addEventListener.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') Promise.resolve().then(cb);
    });
    jest.spyOn(window, 'XMLHttpRequest').mockImplementation(() => xhrMock as unknown as XMLHttpRequest);

    render(<NuevaPolicyPage />);

    await act(async () => {
      capturedOnDrop!([mockFile], []);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subir póliza' }));
    });

    await waitFor(() => {
      expect(policiesApi.ingest).toHaveBeenCalledWith('pol-abc123');
      expect(mockPush).toHaveBeenCalledWith('/policies/pol-abc123');
    });
  });

  it('shows error message when getUploadUrl fails', async () => {
    const mockFile = new File(['pdf'], 'pol.pdf', { type: 'application/pdf' });

    (policiesApi.getUploadUrl as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<NuevaPolicyPage />);

    await act(async () => {
      capturedOnDrop!([mockFile], []);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subir póliza' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Error al obtener URL de subida/)).toBeInTheDocument();
    });
  });

  it('shows error message when ingest fails', async () => {
    const mockFile = new File(['pdf'], 'pol.pdf', { type: 'application/pdf' });

    (policiesApi.getUploadUrl as jest.Mock).mockResolvedValue({
      policyId: 'pol-xyz',
      s3KeyOriginal: 'policies/default/usr/pol-xyz/original.pdf',
      presignedPutUrl: 'https://s3.example.com/upload',
      expiresIn: 300,
    });
    (policiesApi.ingest as jest.Mock).mockRejectedValue(new Error('Ingest failed'));

    const xhrMock = {
      upload: { addEventListener: jest.fn() },
      addEventListener: jest.fn(),
      open: jest.fn(),
      setRequestHeader: jest.fn(),
      send: jest.fn(),
      status: 200,
      timeout: 0,
    };
    xhrMock.addEventListener.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') Promise.resolve().then(cb);
    });
    jest.spyOn(window, 'XMLHttpRequest').mockImplementation(() => xhrMock as unknown as XMLHttpRequest);

    render(<NuevaPolicyPage />);

    await act(async () => {
      capturedOnDrop!([mockFile], []);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subir póliza' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Error al iniciar el procesamiento/)).toBeInTheDocument();
    });
  });

  it('shows hint text for accepted file types', () => {
    render(<NuevaPolicyPage />);
    expect(screen.getByText(/PDF, PNG o JPG/)).toBeInTheDocument();
  });
});
