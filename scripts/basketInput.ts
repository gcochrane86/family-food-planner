// Input for `basket record` and `basket finish`. It arrives as JSON on stdin so that product names and summaries
// copied from Sainsbury's pages never pass through a shell command line.

export interface ProductInput { key: string; name: string; url: string | null; size: number | null; unit: string; price: number | null; pin: boolean }
export interface FinishInput { run: string; status: 'done' | 'failed'; summary: string | null }

function parse(text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Input must be a JSON object on stdin'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Input must be a JSON object on stdin');
  return value as Record<string, unknown>;
}
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function parseProduct(input: string): ProductInput {
  const o = parse(input);
  const key = text(o.key, 200) ?? (() => { throw new Error('"key" is required'); })();
  const name = text(o.name, 300) ?? (() => { throw new Error('"name" is required'); })();
  const url = text(o.url, 1000);
  if (url) {
    let host = '';
    try { host = new URL(url).hostname; } catch { /* checked below */ }
    if (!url.startsWith('https://') || !(host === 'sainsburys.co.uk' || host.endsWith('.sainsburys.co.uk'))) throw new Error('"url" must be a Sainsbury\'s product link');
  }
  return { key, name, url, size: num(o.size), unit: text(o.unit, 20) ?? '', price: num(o.price), pin: o.pin === true };
}

export function parseFinish(input: string): FinishInput {
  const o = parse(input);
  const run = text(o.run, 100) ?? (() => { throw new Error('"run" is required'); })();
  if (o.status !== 'done' && o.status !== 'failed') throw new Error('"status" must be done or failed');
  return { run, status: o.status, summary: text(o.summary, 2000) };
}
