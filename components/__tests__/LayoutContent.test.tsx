import { render, screen } from '@testing-library/react';
import { useAuth } from '@/lib/auth-context';
import LayoutContent from '../LayoutContent';

// Mock the auth context
jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

// Mock the Navbar component
jest.mock('../Navbar', () => {
  return function MockNavbar() {
    return <nav data-testid="navbar">Navbar</nav>;
  };
});

describe('LayoutContent', () => {
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render Navbar when user is authenticated', () => {
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

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should not render Navbar when user is not authenticated', () => {
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

    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should apply padding to main when authenticated', () => {
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
    expect(main).toHaveClass('pt-16', 'md:pt-20');
  });

  it('should not apply padding to main when not authenticated', () => {
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
    expect(main).not.toHaveClass('pt-16');
    expect(main).not.toHaveClass('md:pt-20');
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
});
