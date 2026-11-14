import { lengthFromPage, makeYouTubeReader, toSeconds, videoRequest, youTubeId } from './youtube';

test('YouTube links of every shape give the video id; other links none', () => {
  for (const u of ['https://www.youtube.com/watch?v=abcDEF12345', 'https://youtu.be/abcDEF12345', 'https://www.youtube.com/shorts/abcDEF12345', 'https://m.youtube.com/watch?v=abcDEF12345&t=30'])
    expect(youTubeId(u)).toBe('abcDEF12345');
  expect(youTubeId('https://example.com/watch?v=abcDEF12345')).toBeNull();
  expect(youTubeId('http://www.youtube.com/watch?v=abcDEF12345')).toBeNull();
});

test('times are read as hours, minutes and seconds', () => {
  expect(toSeconds('1:12:00')).toBe(4320);
  expect(toSeconds('72:00')).toBe(4320);
  expect(toSeconds('4320')).toBe(4320);
  expect(toSeconds('4320s')).toBe(4320);
  expect(toSeconds('1h12m')).toBe(4320);
  expect(toSeconds('soon')).toBeNull();
});

test("the video's length comes from its page when it's there", () => {
  expect(lengthFromPage('..."lengthSeconds":"7215",...')).toBe(7215);
  expect(lengthFromPage('<html>')).toBeNull();
});

test('a short video is watched whole; a long or unknown one at one frame every 5 seconds', () => {
  const short = videoRequest({ id: 'abcDEF12345', length: 600 });
  if ('error' in short) throw new Error(short.error);
  const video = short.body.contents[0].parts[0];
  expect(video.file_data.file_uri).toBe('https://www.youtube.com/watch?v=abcDEF12345');
  expect(video.video_metadata).toBeUndefined();
  for (const length of [7200, null]) {
    const long = videoRequest({ id: 'abcDEF12345', length });
    if ('error' in long) throw new Error(long.error);
    expect(long.body.contents[0].parts[0].video_metadata).toEqual({ fps: 0.2 });
  }
});

test('a named part is clipped, and only that part counts for the frame rate', () => {
  const r = videoRequest({ id: 'abcDEF12345', length: 7200, start: '1:12:00', end: '1:27:00', which: 'the curry' });
  if ('error' in r) throw new Error(r.error);
  expect(r.body.contents[0].parts[0].video_metadata).toEqual({ start_offset: '4320s', end_offset: '5220s' });
  expect(r.body.contents[0].parts[1].text).toMatch(/the curry/);
});

test('over 3 hours with no part named is refused before Gemini is asked', () => {
  expect(videoRequest({ id: 'abcDEF12345', length: 11000 })).toEqual({ error: expect.stringMatching(/over 3 hours.*start and end/s) });
  expect('error' in videoRequest({ id: 'abcDEF12345', length: 11000, start: '10:00', end: '30:00' })).toBe(false);
});

test("the reader asks Gemini and returns its write-up, with what it cost", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('youtube.com')) return new Response('{"lengthSeconds":"600"}');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Ingredients: 2 onions…' }] } }], usageMetadata: { promptTokenCount: 80000 } }));
  });
  const out = await makeYouTubeReader('key', fetchFn as never).read({ url: 'https://youtu.be/abcDEF12345' });
  expect(out).toMatch(/Ingredients: 2 onions/);
  expect(out).toMatch(/80,000 tokens/);
  const gemini = calls.find((c) => c.url.includes('generativelanguage'))!;
  expect(gemini.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  expect((gemini.init!.headers as Record<string, string>)['x-goog-api-key']).toBe('key');
});

test("a video Gemini can't read asks for the transcript; a non-YouTube link is turned away", async () => {
  const fetchFn = vi.fn(async (url: string) => (url.includes('youtube.com') ? new Response('', { status: 429 })
    : new Response(JSON.stringify({ error: { message: 'Video is private' } }), { status: 400 })));
  const r = makeYouTubeReader('key', fetchFn as never);
  expect(await r.read({ url: 'https://youtu.be/abcDEF12345' })).toMatch(/couldn't watch.*Video is private.*Show transcript/s);
  expect(await r.read({ url: 'https://example.com/v' })).toMatch(/isn't a YouTube video/);
});

test('Gemini taking too long (or the network failing) still ends in the transcript advice, and the call has a time limit', async () => {
  let signal: AbortSignal | undefined;
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('youtube.com')) return new Response('{"lengthSeconds":"600"}');
    signal = init?.signal ?? undefined;
    throw new DOMException('The operation timed out.', 'TimeoutError');
  });
  const out = await makeYouTubeReader('key', fetchFn as never).read({ url: 'https://youtu.be/abcDEF12345' });
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(out).toMatch(/took too long or couldn't be reached.*Show transcript/s);
});
