import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdateBanner from './UpdateBanner';

const h = vi.hoisted(() => ({ needRefresh: false, update: vi.fn() }));
vi.mock('../lib/appUpdate', () => ({ useAppUpdate: () => ({ needRefresh: h.needRefresh, refresh: h.update }) }));

test('nothing shows while the app is up to date', () => {
  h.needRefresh = false;
  render(<UpdateBanner />);
  expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
});

test('a new version offers Refresh, which reloads into it', async () => {
  h.needRefresh = true;
  render(<UpdateBanner />);
  expect(screen.getByRole('status')).toHaveTextContent('A new version of the app is ready');
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(h.update).toHaveBeenCalled();
});
