// "Ask Claude": a read-only MCP connector for the Claude app (docs/spec.md §10). The household adds it once as a
// custom connector with the secret link …/functions/v1/ask-claude-connector/<key>; Claude then looks up recipes,
// plans, the pantry and saved products while they chat, and (each call approved by the household in Claude) saves
// tonight's version of a day's recipe, swaps a dinner, marks a staple, or plans a week's dinners as a draft (adding
// any new recipes for it). It never edits saved recipes.
// Deployed with --no-verify-jwt (Claude has no app login); the key in the path is the lock. A missing or wrong key
// gets a bare 404. Secrets: CONNECTOR_KEY, CONNECTOR_HOUSEHOLD_ID.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { McpServer, StreamableHttpTransport } from 'npm:mcp-lite@0.10.0';
import {
  findRecipes, formatHousehold, formatPantry, formatProducts, formatRecipe, formatWeek, keyMatches, makeReader, pickRecipe,
  weekStartFor, type Reader,
} from '../_shared/askClaude.ts';
import { makeChanger } from '../_shared/askClaudeWrite.ts';
import { makePlanner } from '../_shared/askClaudePlan.ts';
import { MEAL_SPEC } from '../_shared/mealSpec.ts';

const notFound = () => new Response('Not found', { status: 404 });
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const readOnly = { readOnlyHint: true };
const changes = { readOnlyHint: false, destructiveHint: false };
const DATE = { type: 'string', description: 'The day, as YYYY-MM-DD (today to next Sunday)' };
const SLOT = { type: 'string', enum: ['breakfast', 'lunch', 'dinner'], description: 'Which meal (default dinner)' };

/** Runs a lookup; a failure comes back as words for Claude, never a stack. */
const safely = async (run: () => Promise<string>, what = 'read the planner') => {
  try { return text(await run()); } catch (e) { return text(`Couldn't ${what} just now: ${e instanceof Error ? e.message : String(e)}`); }
};

function server(read: Reader, change: ReturnType<typeof makeChanger>, plan: ReturnType<typeof makePlanner>) {
  const mcp = new McpServer({ name: 'family-food-planner', version: '1.0.0' });
  mcp.tool('get_household', {
    description: "Call this first. How to answer, then the household's members and portions, house rules and private rules, what makes a meal, kit (TM7s and bowls, oven, APO, air fryer), Today's hour and the breakfast and lunch options.",
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
  mcp.tool('swap_meal', {
    description: "Changes the plan (the household approves each call in Claude): swaps a day's dinner for another of their recipes, or sets it to eating out, with the app's own rules (leftover lunches go back to their routine, portions set, kept from being replanned). Only this week and next, from today.",
    inputSchema: { type: 'object', properties: { date: DATE, recipe: { type: 'string', description: 'The new recipe title' }, out: { type: 'boolean', description: 'true for eating out' } }, required: ['date'] },
    annotations: changes,
    handler: (args: Record<string, unknown>) => safely(() => change.swapMeal(args ?? {})),
  });
  mcp.tool('set_tonights_version', {
    description: "Changes the plan (the household approves each call in Claude): saves tonight's version of the recipe on one day, for a swapped ingredient or a different method. The saved recipe is untouched. Read the recipe with get_recipe first, then send the full ingredients and steps for that day, for the recipe's own base portions. Every saved ingredient and step must be kept, named in replaces, or listed in removed_ingredients / removed_steps.",
    inputSchema: {
      type: 'object', required: ['date', 'note', 'ingredients', 'steps'],
      properties: {
        date: DATE, slot: SLOT, note: { type: 'string', description: "One line: what's different tonight" },
        ingredients: { type: 'array', items: { type: 'object', required: ['name'], properties: {
          name: { type: 'string' }, qty: { type: ['number', 'null'] }, unit: { type: 'string' }, note: { type: ['string', 'null'] },
          group_name: { type: ['string', 'null'] }, replaces: { type: 'string', description: 'The saved ingredient this one replaces' } } } },
        removed_ingredients: { type: 'array', items: { type: 'string' } },
        steps: { type: 'array', items: { type: 'object', required: ['phase', 'title', 'body'], properties: {
          phase: { type: 'string', enum: ['prep_8pm', 'finish', 'reheat'] }, title: { type: 'string' }, body: { type: 'string' },
          at_minute: { type: ['number', 'null'] }, machine: { type: ['string', 'null'] }, settings: { type: ['string', 'null'] },
          timer_minutes: { type: ['number', 'null'] }, replaces: { type: 'string', description: 'The saved step title this one replaces' },
          needs_night_before: { type: 'boolean', description: 'A prep_8pm step that must be done the night before (a long marinade); kept from the saved step of the same title when left out' } } } },
        removed_steps: { type: 'array', items: { type: 'string' } },
      },
    },
    annotations: changes,
    handler: (args: Record<string, unknown>) => safely(() => change.setVersion(args ?? {})),
  });
  mcp.tool('clear_tonights_version', {
    description: "Changes the plan (the household approves each call in Claude): puts a day back to the saved recipe.",
    inputSchema: { type: 'object', properties: { date: DATE, slot: SLOT }, required: ['date'] },
    annotations: changes,
    handler: (args: Record<string, unknown>) => safely(() => change.clearVersion(args ?? {})),
  });
  mcp.tool('get_plan_context', {
    description: "Call this before planning a week's dinners. How to plan (the household's priorities, in order), then everything the plan needs for that week as JSON: dates and office days, portions, rules (protein balance, time limits, Today's hour, day rules, other shops, what makes a meal, house and private rules), every plannable dinner with times and ingredients, recent dinners, freezer, pantry, pack sizes, whether the week already has a draft, how many new recipes are allowed and the rules for writing one, and the app's own proposal. Read-only.",
    inputSchema: { type: 'object', properties: { week: { type: 'string', description: '"next" (default), "this", or any date in the week as YYYY-MM-DD' } } },
    annotations: readOnly,
    handler: (args: { week?: string }) => safely(() => plan.context(args ?? {})),
  });
  mcp.tool('save_week_plan', {
    description: "Changes the plan (the household approves each call in Claude): saves a week's dinners as a draft. Any new recipes are added first (up to the allowance, written to the newRecipeRules from get_plan_context), the app fills breakfasts and lunches around the dinners, and the household approves the week in the app. Replaces a draft, never an approved week; all or nothing. Agree the dinners with the household before saving.",
    inputSchema: {
      type: 'object', required: ['summary', 'dinners'],
      properties: {
        week: { type: 'string', description: '"next" (default), "this", or any date in the week as YYYY-MM-DD' },
        summary: { type: 'string', description: "2–4 sentences shown on the week: its shape, what's shared between dinners, the flavour spread" },
        dinners: { type: 'array', items: { type: 'object', required: ['date', 'recipe', 'reason'], properties: {
          date: { type: 'string', description: 'YYYY-MM-DD, in the week' },
          recipe: { type: 'string', description: "The recipe's slug or title, or a new recipe's slug" },
          reason: { type: 'string', description: 'One line shown on the day, up to 200 characters' } } } },
        new_recipes: { type: 'array', description: 'New recipes in the seed format from newRecipeRules (up to the allowance)', items: { type: 'object' } },
      },
    },
    annotations: changes,
    handler: (args: Record<string, unknown>) => safely(() => plan.save(args ?? {}), 'save the week'),
  });
  mcp.tool('set_pantry', {
    description: "Changes the pantry (the household approves each call in Claude): marks a staple as have, low or out. Low and out staples go on the next shopping list. Other pantry items are changed in the app.",
    inputSchema: { type: 'object', properties: { item: { type: 'string' }, status: { type: 'string', enum: ['have', 'low', 'out'] } }, required: ['item', 'status'] },
    annotations: changes,
    handler: (args: Record<string, unknown>) => safely(() => change.setPantry(args ?? {})),
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
  return new StreamableHttpTransport().bind(server(makeReader(db, householdId), makeChanger(db, householdId), makePlanner(db, householdId)))(req);
});
