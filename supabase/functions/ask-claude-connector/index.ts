// "Ask Claude": a read-only MCP connector for the Claude app (docs/spec.md §10). The household adds it once as a
// custom connector with the secret link …/functions/v1/ask-claude-connector/<key>; Claude then looks up recipes,
// plans, the pantry and saved products while they chat. It never writes.
// Deployed with --no-verify-jwt (Claude has no app login); the key in the path is the lock. A missing or wrong key
// gets a bare 404. Secrets: CONNECTOR_KEY, CONNECTOR_HOUSEHOLD_ID.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { McpServer, StreamableHttpTransport } from 'npm:mcp-lite@0.10.0';
import {
  findRecipes, formatHousehold, formatPantry, formatProducts, formatRecipe, formatWeek, keyMatches, makeReader, pickRecipe,
  weekStartFor, type Reader,
} from '../_shared/askClaude.ts';
import { MEAL_SPEC } from '../../../src/lib/mealSpec.ts';

const notFound = () => new Response('Not found', { status: 404 });
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const readOnly = { readOnlyHint: true };

/** Runs a lookup; a failure comes back as words for Claude, never a stack. */
const safely = async (run: () => Promise<string>) => {
  try { return text(await run()); } catch (e) { return text(`Couldn't read the planner just now: ${e instanceof Error ? e.message : String(e)}`); }
};

function server(read: Reader) {
  const mcp = new McpServer({ name: 'family-food-planner', version: '1.0.0' });
  mcp.tool('get_household', {
    description: "Call this first. The household's members and portions, house rules and private rules, what makes a meal, kit (TM7s and bowls, oven, APO, air fryer), Today's hour and the breakfast and lunch options. Also how to answer: this connector is read-only.",
    annotations: readOnly,
    handler: () => safely(async () => formatHousehold(await read.household(), MEAL_SPEC)),
  });
  mcp.tool('get_week', {
    description: "One week's plan, day by day: breakfast, lunch and dinner with mode, recipe, portions and the planner's reason, and whether it's approved. Read-only.",
    inputSchema: { type: 'object', properties: { week: { type: 'string', description: '"this" (default), "next", or any date in the week as YYYY-MM-DD' } } },
    annotations: readOnly,
    handler: (args: { week?: string }) => safely(async () => {
      const start = weekStartFor(args?.week, new Date());
      return start ? formatWeek(start, await read.week(start)) : 'Use this, next, or a date like 2026-11-16.';
    }),
  });
  mcp.tool('find_recipes', {
    description: "Search the household's recipes by words (title, protein, tags) and/or one tag. With neither, lists every active recipe with minutes, hands-on time, rating and when last cooked: the list to redesign a week from. Read-only.",
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, tag: { type: 'string' } } },
    annotations: readOnly,
    handler: (args: { query?: string; tag?: string }) => safely(async () => findRecipes(await read.recipes(), args?.query, args?.tag)),
  });
  mcp.tool('get_recipe', {
    description: 'One recipe in full: ingredients with amounts, and steps (night before, at dinner time, reheating) with timings and TM7 settings. Read-only.',
    inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'The recipe title, or a distinctive part of it' } }, required: ['title'] },
    annotations: readOnly,
    handler: (args: { title: string }) => safely(async () => {
      const picked = pickRecipe(await read.recipes(), String(args?.title ?? ''));
      if ('text' in picked) return picked.text;
      const d = await read.recipe(picked.id);
      return d ? formatRecipe(d) : `No recipe called "${args.title}".`;
    }),
  });
  mcp.tool('get_pantry', {
    description: "What's in: staples (have, low, out), other items by fridge, freezer and cupboard, and cooked portions kept with use-by dates. Read-only.",
    annotations: readOnly,
    handler: () => safely(async () => formatPantry(await read.pantry())),
  });
  mcp.tool('get_products', {
    description: "The Sainsbury's product saved for each shopping item, with pack size and the price last seen. Saved prices, not live offers: say so when you use them. Read-only.",
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    annotations: readOnly,
    handler: (args: { query?: string }) => safely(async () => formatProducts(await read.products(), args?.query)),
  });
  return mcp;
}

Deno.serve((req) => {
  // The path is /ask-claude-connector/<key>, optionally followed by /mcp.
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const at = parts.indexOf('ask-claude-connector');
  const rest = at < 0 ? [] : parts.slice(at + 1);
  if (rest.length < 1 || rest.length > 2 || (rest.length === 2 && rest[1] !== 'mcp')) return notFound();
  if (!keyMatches(rest[0], Deno.env.get('CONNECTOR_KEY'))) return notFound();
  const householdId = Deno.env.get('CONNECTOR_HOUSEHOLD_ID');
  if (!householdId) return notFound();

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  return new StreamableHttpTransport().bind(server(makeReader(db, householdId)))(req);
});
