import { render, screen } from '@testing-library/react';
import { fakeSupabase, type FakeSupabase } from './test/fakeSupabase';
import App from './App';

const h = vi.hoisted(() => ({ client: null as unknown as FakeSupabase }));
vi.mock('./lib/supabase', () => ({ getSupabase: () => h.client }));

test('renders bottom nav with Week, Recipes, Pantry, Shop and a Settings link', async () => {
  h.client = fakeSupabase({ signedIn: true, householdId: 'h1' });
  render(<App />);
  const nav = await screen.findByRole('navigation', { name: 'Main' });
  for (const name of ['Week', 'Recipes', 'Pantry', 'Shop']) {
    expect(nav).toContainElement(screen.getByRole('link', { name }));
  }
  expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
});

test('signed-out visitors see sign in, not the nav', async () => {
  h.client = fakeSupabase({ signedIn: false });
  render(<App />);
  expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
});
