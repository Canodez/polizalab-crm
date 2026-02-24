import { render, screen } from '@testing-library/react';
import { useAuth } from '@/lib/auth-context';
import LayoutContent from '../LayoutContent';

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../Sidebar', () => {
  return function MockSidebar() {
    return <aside data-testid="sidebar">Sidebar</aside>;
  };
});

jest.mock('../Avatar', () => {
  return function MockAvatar({ email }: { email: string }) {
    return <div data-testid="avatar">{email.charAt(0).toUpperCase()}</div>;
  };
});

jest.mock('@/lib/api-client', () => ({
  profileApi: {
    getProfile: jest.fn().mockResolvedValue({ profileImageUrl: null }),
  },
}));

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) {
    return <a href={href} {...props}>{children}</a>;
  };
});

jest.mock('@/lib/hooks/useSidebarState', () => ({
  useSidebarState: () => ({
    isCollapsed: false,
    toggleCollapsed: jest.fn(),
    isMobileOpen: false,
    openMobile: jest.fn(),
    closeMobile: jest.fn(),
  }),
}));

describe('LayoutContent', () => {
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render Sidebar when user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { email: 'test@example.com' },
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(
      <LayoutContent>
        <div>Test Content</div>
      </LayoutContent>
    );

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should not render Sidebar when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(
      <LayoutContent>
        <div>Test Content</div>
      </LayoutContent>
    );

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should apply margin to main when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { email: 'test@example.com' },
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    const { container } = render(
      <LayoutContent>
        <div>Test Content</div>
      </LayoutContent>
    );

    const main = container.querySelector('main');
    expect(main).toHaveClass('lg:ml-64');
  });

  it('should not apply margin to main when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    const { container } = render(
      <LayoutContent>
        <div>Test Content</div>
      </LayoutContent>
    );

    const main = container.querySelector('main');
    expect(main).not.toHaveClass('lg:ml-64');
  });

  it('should render children correctly', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(
      <LayoutContent>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </LayoutContent>
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  it('should show mobile top bar with avatar when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { email: 'test@example.com' },
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(
      <LayoutContent>
        <div>Test Content</div>
      </LayoutContent>
    );

    expect(screen.getByLabelText('Abrir menú')).toBeInTheDocument();
    expect(screen.getByText('PolizaLab')).toBeInTheDocument();
    expect(screen.getByLabelText('Mi cuenta')).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });
});
