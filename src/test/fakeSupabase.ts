/* A stand-in for the parts of the Supabase client the auth layer uses. */
interface FakeOptions {
  signedIn?: boolean;
  householdId?: string | null;
  /** household the user turns out to have after signing in */
  householdAfterSignIn?: string | null;
  verifyFails?: boolean;
  joinError?: string;
  unreachable?: boolean;
}

export function fakeSupabase(opts: FakeOptions = {}) {
  let session: { user: { id: string } } | null = opts.signedIn ? { user: { id: 'u1' } } : null;
  let householdId = opts.householdId ?? null;
  let unreachable = !!opts.unreachable;

  return {
    setReachable() { unreachable = false; },
    auth: {
      getSession: vi.fn(async () =>
        unreachable ? { data: { session: null }, error: { message: 'Failed to fetch' } } : { data: { session }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => {
        if (opts.verifyFails) return { data: { session: null }, error: { message: 'Token has expired or is invalid' } };
        session = { user: { id: 'u1' } };
        if (opts.householdAfterSignIn !== undefined) householdId = opts.householdAfterSignIn;
        return { data: { session }, error: null };
      }),
      signOut: vi.fn(async () => { session = null; return { error: null }; }),
    },
    from: vi.fn(() => ({
      select: () => ({
        limit: async () =>
          unreachable
            ? { data: null, error: { message: 'Failed to fetch' } }
            : { data: householdId ? [{ household_id: householdId }] : [], error: null },
      }),
    })),
    rpc: vi.fn(async (name: string) => {
      if (name === 'join_household' && opts.joinError) return { data: null, error: { message: opts.joinError } };
      householdId = 'h1';
      return { data: 'h1', error: null };
    }),
  };
}
export type FakeSupabase = ReturnType<typeof fakeSupabase>;
