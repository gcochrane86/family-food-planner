import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeSupabase, type FakeSupabase } from '../test/fakeSupabase';
import { AuthProvider } from './AuthProvider';
import SignIn from './SignIn';

const h = vi.hoisted(() => ({ client: null as unknown as FakeSupabase }));
vi.mock('../lib/supabase', () => ({ getSupabase: () => h.client }));

async function signIn(email: string, password: string) {
  render(<AuthProvider><SignIn /></AuthProvider>);
  await userEvent.type(await screen.findByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

test('signs in with email and password', async () => {
  h.client = fakeSupabase();
  await signIn(' me@example.com ', 'correct horse');
  expect(h.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'correct horse' });
  expect(h.client.auth.signInWithOtp).not.toHaveBeenCalled();
});

test('fields are set up for password managers', async () => {
  h.client = fakeSupabase();
  render(<AuthProvider><SignIn /></AuthProvider>);
  expect(await screen.findByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
});

test('wrong password shows a message and keeps the email', async () => {
  h.client = fakeSupabase({ passwordError: 'Invalid login credentials' });
  await signIn('me@example.com', 'wrong');
  expect(await screen.findByRole('alert')).toHaveTextContent("That email and password don't match. Check them and try again.");
  expect(screen.getByLabelText('Email')).toHaveValue('me@example.com');
});

test('no connection says so instead of blaming the password', async () => {
  h.client = fakeSupabase({ passwordError: 'Failed to fetch' });
  await signIn('me@example.com', 'correct horse');
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server. Check your connection and try again.");
});

test('there is no way to sign up from the app', async () => {
  h.client = fakeSupabase();
  render(<AuthProvider><SignIn /></AuthProvider>);
  await screen.findByLabelText('Email');
  expect(screen.queryByRole('button', { name: /sign up|create account|send code/i })).not.toBeInTheDocument();
});
