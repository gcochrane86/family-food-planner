import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fakeSupabase, type FakeSupabase } from '../test/fakeSupabase';
import { AuthProvider } from './AuthProvider';
import RequireHousehold from './RequireHousehold';

const h = vi.hoisted(() => ({ client: null as unknown as FakeSupabase }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => h.client }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <RequireHousehold>
          <Routes>
            <Route path="/week" element={<h1>Week</h1>} />
            <Route path="/settings" element={<h1>Settings</h1>} />
          </Routes>
        </RequireHousehold>
      </AuthProvider>
    </MemoryRouter>,
  );
}

test('signed in without household shows create and join', async () => {
  h.client = fakeSupabase({ signedIn: true, householdId: null });
  renderAt('/week');
  expect(await screen.findByRole('button', { name: 'Create our household' })).toBeInTheDocument();
  expect(screen.getByLabelText('I have a code')).toBeInTheDocument();
});

test('join with bad code shows message', async () => {
  h.client = fakeSupabase({ signedIn: true, householdId: null, join: 'wrong' });
  renderAt('/week');
  await userEvent.type(await screen.findByLabelText('I have a code'), 'abcd234567');
  await userEvent.click(screen.getByRole('button', { name: 'Join' }));
  expect(h.client.rpc).toHaveBeenCalledWith('join_household', { p_code: 'ABCD234567' });
  expect(await screen.findByRole('alert')).toHaveTextContent('No household has that code.');
});

test('too many wrong codes says to wait', async () => {
  h.client = fakeSupabase({ signedIn: true, householdId: null, join: 'too_many_attempts' });
  renderAt('/week');
  await userEvent.type(await screen.findByLabelText('I have a code'), 'ABCD234567');
  await userEvent.click(screen.getByRole('button', { name: 'Join' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many wrong codes. Try again in an hour.');
});

test('creating a household shows the app', async () => {
  h.client = fakeSupabase({ signedIn: true, householdId: null });
  renderAt('/week');
  await userEvent.click(await screen.findByRole('button', { name: 'Create our household' }));
  expect(h.client.rpc).toHaveBeenCalledWith('create_household', { p_name: 'Our household' });
  expect(await screen.findByRole('heading', { name: 'Week' })).toBeInTheDocument();
});

test('returns to requested route after sign in', async () => {
  h.client = fakeSupabase({ signedIn: false, householdAfterSignIn: 'h1' });
  renderAt('/settings');
  await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  await userEvent.type(await screen.findByLabelText('6-digit code'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
});

test('unreachable server shows a retry banner, not a spinner', async () => {
  h.client = fakeSupabase({ unreachable: true });
  renderAt('/week');
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server.");
  h.client.setReachable();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Email')).toBeInTheDocument();
});
