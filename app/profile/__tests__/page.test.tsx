import { render } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import ProfileRedirect from '../page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

describe('ProfileRedirect', () => {
  it('redirects to /account/profile on mount', () => {
    const mockReplace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ replace: mockReplace });

    render(<ProfileRedirect />);

    expect(mockReplace).toHaveBeenCalledWith('/account/profile');
  });

  it('renders nothing', () => {
    const mockReplace = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ replace: mockReplace });

    const { container } = render(<ProfileRedirect />);
    expect(container.firstChild).toBeNull();
  });
});
