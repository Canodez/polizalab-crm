import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SecurityPage from '../page';
import { securityApi } from '@/lib/api/securityApi';

jest.mock('@/lib/api/securityApi', () => ({
  securityApi: {
    changePassword: jest.fn(),
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

describe('SecurityPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (securityApi.changePassword as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders form with 3 password fields', () => {
    render(<SecurityPage />);
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument();
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar nueva contraseña')).toBeInTheDocument();
  });

  it('save button disabled when fields are empty', () => {
    render(<SecurityPage />);
    const saveButton = screen.getByRole('button', { name: /actualizar contraseña/i });
    expect(saveButton).toBeDisabled();
  });

  it('shows error when newPassword !== confirmPassword', async () => {
    render(<SecurityPage />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'different' } });

    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument();
  });

  it('save button disabled when newPassword < 8 chars', () => {
    render(<SecurityPage />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'short' } });

    const saveButton = screen.getByRole('button', { name: /actualizar contraseña/i });
    expect(saveButton).toBeDisabled();
  });

  it('show/hide password toggles work for current password', () => {
    render(<SecurityPage />);

    const currentInput = screen.getByLabelText('Contraseña actual');
    expect(currentInput).toHaveAttribute('type', 'password');

    const toggleButtons = screen.getAllByLabelText('Mostrar contraseña');
    fireEvent.click(toggleButtons[0]);

    expect(currentInput).toHaveAttribute('type', 'text');
  });

  it('show/hide password toggles work for new password', () => {
    render(<SecurityPage />);

    const newInput = screen.getByLabelText('Nueva contraseña');
    expect(newInput).toHaveAttribute('type', 'password');

    const toggleButtons = screen.getAllByLabelText('Mostrar contraseña');
    fireEvent.click(toggleButtons[1]);

    expect(newInput).toHaveAttribute('type', 'text');
  });

  it('show/hide password toggles work for confirm password', () => {
    render(<SecurityPage />);

    const confirmInput = screen.getByLabelText('Confirmar nueva contraseña');
    expect(confirmInput).toHaveAttribute('type', 'password');

    const toggleButtons = screen.getAllByLabelText('Mostrar contraseña');
    fireEvent.click(toggleButtons[2]);

    expect(confirmInput).toHaveAttribute('type', 'text');
  });

  it('happy path: calls securityApi.changePassword and shows success toast', async () => {
    render(<SecurityPage />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'OldPass123' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewPass456!' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'NewPass456!' } });

    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    await waitFor(() => {
      expect(securityApi.changePassword).toHaveBeenCalledWith('OldPass123', 'NewPass456!');
      expect(screen.getByText('Contraseña actualizada correctamente')).toBeInTheDocument();
    });
  });

  it('clears fields after successful password change', async () => {
    render(<SecurityPage />);

    const currentInput = screen.getByLabelText('Contraseña actual') as HTMLInputElement;
    fireEvent.change(currentInput, { target: { value: 'OldPass123' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewPass456!' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'NewPass456!' } });

    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    await waitFor(() => {
      expect(currentInput.value).toBe('');
    });
  });

  it('shows "Contraseña actual incorrecta" on NotAuthorizedException', async () => {
    (securityApi.changePassword as jest.Mock).mockRejectedValue(
      new Error('Contraseña actual incorrecta')
    );

    render(<SecurityPage />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewPass456!' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'NewPass456!' } });

    // Override validation: 'wrong' is less than 8 chars, use a longer one
    // Need to set valid current password. Let's use something longer:
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'wrongpass123' } });

    fireEvent.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    await waitFor(() => {
      expect(screen.getByText('Contraseña actual incorrecta')).toBeInTheDocument();
    });
  });

  it('shows password strength indicator for new password', async () => {
    render(<SecurityPage />);

    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'weak' } });
    expect(screen.getByText(/seguridad:/i)).toBeInTheDocument();
  });
});
