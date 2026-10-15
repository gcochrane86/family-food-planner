import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBanner from './ErrorBanner';

test('ErrorBanner shows message and calls onRetry', async () => {
  const onRetry = vi.fn();
  render(<ErrorBanner message="Couldn't reach the server." onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach the server.");
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
