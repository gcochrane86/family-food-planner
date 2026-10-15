import { projectUrl } from './supabaseUrl';

test.each([
  ['https://abc.supabase.co', 'https://abc.supabase.co'],
  ['https://abc.supabase.co/', 'https://abc.supabase.co'],
  ['https://abc.supabase.co/rest/v1/', 'https://abc.supabase.co'],
  ['https://abc.supabase.co/rest/v1', 'https://abc.supabase.co'],
  [' https://abc.supabase.co/auth/v1/ ', 'https://abc.supabase.co'],
])('%j becomes the bare project address', (input, expected) => {
  expect(projectUrl(input)).toBe(expected);
});
