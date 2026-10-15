import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeSupabase, type FakeSupabase } from '../test/fakeSupabase';
import { AuthProvider } from './AuthProvider';
import SignInWithCode from './SignInWithCode';

const h = vi.hoisted(() => ({ client: null as unknown as FakeSupabase }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => h.client }));

function renderSignIn() {
  return render(<AuthProvider><SignInWithCode /></AuthProvider>);
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

test('hitting the email limit says to wait', async () => {
  h.client = fakeSupabase({ sendError: 'email rate limit exceeded' });
  renderSignIn();
  await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many codes sent. Wait a few minutes, then try again.');
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
