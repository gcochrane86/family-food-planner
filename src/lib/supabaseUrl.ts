/**
 * The client needs the bare project address. Supabase's dashboard also shows longer API URLs
 * (e.g. ".../rest/v1/"), and pasting one of those makes every request go to the wrong path.
 */
export function projectUrl(url: string): string {
  return new URL(url.trim()).origin;
}
