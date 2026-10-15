import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeSupabase, type FakeSupabase } from '../test/fakeSupabase';
import { AuthProvider } from './AuthProvider';
import SignIn from './SignIn';

const h = vi.hoisted(() => ({ client: null as unknown as FakeSupabase }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => h.client }));

function renderSignIn() {
  return render(<AuthProvider><SignIn /></AuthProvider>);
}

test('sends a code then verifies it', async () => {
  h.client = fakeSupabase();
  renderSignIn();
  await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(h.client.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'me@example.com', options: { shouldCreateUser: true } });

  await userEvent.type(await screen.findByLabelText('6-digit code'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(h.client.auth.verifyOtp).toHaveBeenCalledWith({ email: 'me@example.com', token: '123456', type: 'email' });
});

test('wrong code shows message and keeps email', async () => {
  h.client = fakeSupabase({ verifyFails: true });
  renderSignIn();
  await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  await userEvent.type(await screen.findByLabelText('6-digit code'), '000000');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work. Check it or send a new one.");
  expect(screen.getByText('me@example.com')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
  expect(h.client.auth.signInWithOtp).toHaveBeenCalledTimes(2);
});
