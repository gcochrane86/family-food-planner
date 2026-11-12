// Test helper: a fake Supabase client that answers reads by table (`table` for lists, `table:one` for maybeSingle)
// and records every call, so tests can check which tables were written, how, and with which filters.
export interface Call { table: string; calls: [string, unknown[]][] }

export function tableDb(answers: Record<string, unknown> = {}) {
  const chains: Call[] = [];
  const selects: Record<string, string[]> = {};
  const db = {
    chains,
    selects,
    /** The chains that wrote (insert, upsert, update, delete), with what they wrote and their filters. */
    writes: () => chains.filter((c) => c.calls.some(([m]) => ['insert', 'upsert', 'update', 'delete', 'rpc'].includes(m))).map((c) => {
      const [method, args] = c.calls.find(([m]) => ['insert', 'upsert', 'update', 'delete', 'rpc'].includes(m))!;
      return { table: c.table, method, payload: args[0], options: args[1], filters: c.calls.filter(([m]) => m === 'eq').map(([, a]) => a) };
    }),
    from(table: string) {
      const chain: Call = { table, calls: [] };
      chains.push(chain);
      const proxy: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => void) => res({ data: answers[table] ?? [], error: null });
          return (...args: unknown[]) => {
            chain.calls.push([String(prop), args]);
            if (prop === 'select') (selects[table] ??= []).push(String(args[0]));
            if (prop === 'maybeSingle') return Promise.resolve({ data: answers[`${table}:one`] ?? null, error: null });
            return proxy;
          };
        },
      });
      return proxy;
    },
  };
  return db;
}
