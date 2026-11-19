import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import BottomNav from '../../components/BottomNav';
import { isAdhoc } from '../../lib/adhoc';
import PlanMode from './PlanMode';

afterEach(() => localStorage.clear());

test('switching this phone to ad-hoc turns the Week tab into Plan, and back again', async () => {
  render(<MemoryRouter><PlanMode /><BottomNav /></MemoryRouter>);
  expect(screen.getByRole('radio', { name: /Weekly plan/ })).toBeChecked();
  expect(screen.getByRole('link', { name: 'Week' })).toHaveAttribute('href', '/week');
  await userEvent.click(screen.getByRole('radio', { name: /Ad-hoc/ }));
  expect(isAdhoc()).toBe(true);
  expect(screen.getByRole('link', { name: 'Plan' })).toHaveAttribute('href', '/adhoc');
  expect(screen.queryByRole('link', { name: 'Week' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: /Weekly plan/ }));
  expect(isAdhoc()).toBe(false);
  expect(screen.getByRole('link', { name: 'Week' })).toBeInTheDocument();
});
