/** Invite codes are 10 characters (see new_invite_code in the migration). */
export const INVITE_LENGTH = 10;

export const normaliseCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITE_LENGTH);

/** What to tell someone whose join attempt failed. `null` result means the code matched nothing. */
export function joinErrorMessage(error: { message: string } | null): string {
  if (!error) return 'No household has that code.';
  if (error.message.includes('too_many_attempts')) return 'Too many wrong codes. Try again in an hour.';
  return `Couldn't join: ${error.message}`;
}
