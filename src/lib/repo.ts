import { getSupabase } from './supabase';
import { validateSettings } from './household';
import { recipeSavePayload } from './recipeEdit';
import { slugify } from './mealPhotos';
import type {
  BasketRun, Equipment, FreshStart, PantryEntry, PreparedItem, RecipeImport, Household, HouseRule, MealSlot, Member, PlanWeek, Product, QuickItem, Recipe, RecipeDetail, RecipeIngredient, RecipeStep,
  Settings, Staple, StapleStatus, WeekPattern, WeeklyBasic, CookidooRun, RecipeEdit, RecipeRework } from './types';

type Result<T> = { data: T | null; error: { message: string } | null };

function must<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const db = () => getSupabase();

const toRecipe = (r: Recipe): Recipe => ({
  ...r,
  base_portions: Number(r.base_portions),
  salt_per_portion_g: r.salt_per_portion_g === null ? null : Number(r.salt_per_portion_g),
});

export const repo = {
  async getHousehold(householdId: string): Promise<Household> {
    return must(await db().from('households').select('id, name, invite_code').eq('id', householdId).single());
  },

  /** Leaves the current household for the one with this code. Returns null when no household has the code. */
  async joinHousehold(code: string): Promise<string | null> {
    const { data, error } = await getSupabase().rpc('join_household', { p_code: code });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  },

  async listMembers(householdId: string): Promise<Member[]> {
    const rows = must<Member[]>(await db().from('members').select('*').eq('household_id', householdId).order('kind').order('name'));
    return rows.map((m) => ({ ...m, portion_weight: Number(m.portion_weight) }));
  },
  async saveMember(member: Omit<Member, 'id'> & { id?: string }): Promise<Member> {
    return must(await db().from('members').upsert(member).select().single());
  },
  async deleteMember(id: string): Promise<void> {
    must(await db().from('members').delete().eq('id', id));
  },

  async getWeekPattern(): Promise<WeekPattern[]> {
    // RLS limits rows to members of the signed-in user's household.
    return must(await db().from('member_week_pattern').select('member_id, weekday, office'));
  },
  async setOffice(memberId: string, weekday: number, office: boolean): Promise<void> {
    must(await db().from('member_week_pattern').upsert({ member_id: memberId, weekday, office }));
  },

  async getSettings(householdId: string): Promise<Settings> {
    const row = must<{ data: unknown } | null>(await db().from('settings').select('data').eq('household_id', householdId).maybeSingle());
    return validateSettings(row?.data);
  },
  async saveSettings(householdId: string, settings: Settings): Promise<void> {
    must(await db().from('settings').upsert({ household_id: householdId, data: settings }));
  },

  async listRules(householdId: string): Promise<HouseRule[]> {
    return must(await db().from('house_rules').select('*').eq('household_id', householdId).order('kind').order('match'));
  },
  async saveRule(rule: Omit<HouseRule, 'id'> & { id?: string }): Promise<HouseRule> {
    return must(await db().from('house_rules').upsert(rule).select().single());
  },
  async deleteRule(id: string): Promise<void> {
    must(await db().from('house_rules').delete().eq('id', id));
  },

  async listEquipment(householdId: string): Promise<Equipment[]> {
    return must(await db().from('equipment').select('id, household_id, code, name').eq('household_id', householdId).order('name'));
  },
  async saveEquipment(item: Omit<Equipment, 'id'> & { id?: string }): Promise<Equipment> {
    return must(await db().from('equipment').upsert(item).select('id, household_id, code, name').single());
  },
  async deleteEquipment(id: string): Promise<void> {
    must(await db().from('equipment').delete().eq('id', id));
  },

  async listStaples(householdId: string): Promise<Staple[]> {
    type Row = { id: string; ingredient_id: string; staple_status: StapleStatus; ingredients: { name: string } | { name: string }[] };
    const rows = must<Row[]>(
      await db().from('pantry_items').select('id, ingredient_id, staple_status, ingredients(name)')
        .eq('household_id', householdId).not('staple_status', 'is', null),
    );
    // Many-to-one embeds arrive as an object; untyped clients declare them as arrays.
    const nameOf = (i: Row['ingredients']) => (Array.isArray(i) ? i[0]?.name : i?.name) ?? '';
    return rows
      .map((r) => ({ id: r.id, ingredient_id: r.ingredient_id, name: nameOf(r.ingredients), status: r.staple_status }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async setStaple(pantryItemId: string, status: StapleStatus): Promise<void> {
    must(await db().from('pantry_items').update({ staple_status: status }).eq('id', pantryItemId));
  },
  async addStaple(householdId: string, name: string): Promise<Staple> {
    const ing = must<{ id: string; name: string }>(
      await db().from('ingredients').upsert({ household_id: householdId, name: name.trim(), is_staple: true }, { onConflict: 'household_id,name' })
        .select('id, name').single(),
    );
    // Already tracked: return it rather than adding a second tile.
    const existing = must<{ id: string; staple_status: StapleStatus } | null>(
      await db().from('pantry_items').select('id, staple_status').eq('household_id', householdId)
        .eq('ingredient_id', ing.id).not('staple_status', 'is', null).maybeSingle(),
    );
    if (existing) return { id: existing.id, ingredient_id: ing.id, name: ing.name, status: existing.staple_status };
    const item = must<{ id: string }>(
      await db().from('pantry_items').insert({ household_id: householdId, ingredient_id: ing.id, staple_status: 'have' }).select('id').single(),
    );
    return { id: item.id, ingredient_id: ing.id, name: ing.name, status: 'have' };
  },

  async listRecipes(householdId: string): Promise<Recipe[]> {
    const rows = must<Recipe[]>(await db().from('recipes').select('*')
      .eq('household_id', householdId).neq('status', 'archived').order('title'));
    return rows.map(toRecipe);
  },

  /** A recipe with its ingredients and steps, or null when it isn't in the household's library. */
  async getRecipe(id: string): Promise<RecipeDetail | null> {
    const recipe = must<Recipe | null>(await db().from('recipes').select('*').eq('id', id).maybeSingle());
    if (!recipe) return null;
    const [ingredients, steps] = await Promise.all([
      db().from('recipe_ingredients').select('id, position, group_name, name, qty, unit, note, qty_approx').eq('recipe_id', id).order('position'),
      db().from('recipe_steps').select('id, phase, position, at_minute, title, body, machine, settings, timer_minutes, image_path, image_source, photo_hint')
        .eq('recipe_id', id).order('phase').order('position'),
    ]);
    return {
      ...toRecipe(recipe),
      ingredients: must<RecipeIngredient[]>(ingredients).map((i) => ({ ...i, qty: i.qty === null ? null : Number(i.qty) })),
      steps: must<RecipeStep[]>(steps),
    };
  },

  async getWeek(householdId: string, weekStart: string): Promise<{ week: PlanWeek | null; slots: MealSlot[] }> {
    const week = must<PlanWeek | null>(await db().from('plan_weeks').select('*').eq('household_id', householdId).eq('week_start', weekStart).maybeSingle());
    if (!week) return { week: null, slots: [] };
    const slots = must<MealSlot[]>(await db().from('meal_slots').select('*').eq('plan_week_id', week.id).order('date'));
    return { week, slots: slots.map((s) => ({ ...s, portions: s.portions === null ? null : Number(s.portions) })) };
  },

  /** Saves changed slots (matched on week, date and slot). Which My Week entry Claude made is only ever written by
   *  the Cookidoo sync, so it's left out here: a stale copy on screen must never overwrite it. */
  async saveSlots(slots: MealSlot[]): Promise<void> {
    if (!slots.length) return;
    const rows = slots.map(({ id: _id, cookidoo_recipe_id: _c, ...s }) => s);
    must(await db().from('meal_slots').upsert(rows, { onConflict: 'plan_week_id,date,slot' }));
  },

  async listBasics(householdId: string): Promise<WeeklyBasic[]> {
    const rows = must<WeeklyBasic[]>(await db().from('weekly_basics').select('*').eq('household_id', householdId).order('position'));
    return rows.map((b) => ({ ...b, qty: b.qty === null ? null : Number(b.qty) }));
  },
  async saveBasic(b: WeeklyBasic): Promise<WeeklyBasic> {
    const saved = must<WeeklyBasic>(await db().from('weekly_basics').upsert(b).select().single());
    return { ...saved, qty: saved.qty === null ? null : Number(saved.qty) };
  },
  async deleteBasic(id: string): Promise<void> {
    must(await db().from('weekly_basics').delete().eq('id', id));
  },

  async listQuick(householdId: string): Promise<QuickItem[]> {
    return must(await db().from('quick_shop_items').select('*').eq('household_id', householdId).order('created_at'));
  },
  async addQuick(householdId: string, name: string, note: string | null = null): Promise<QuickItem> {
    return must(await db().from('quick_shop_items').insert({ household_id: householdId, name, note }).select().single());
  },
  async setQuickDone(id: string, done: boolean): Promise<void> {
    must(await db().from('quick_shop_items').update({ done }).eq('id', id));
  },
  async clearQuickDone(householdId: string): Promise<void> {
    must(await db().from('quick_shop_items').delete().eq('household_id', householdId).eq('done', true));
  },

  async getRuns(weekId: string): Promise<BasketRun[]> {
    return must(await db().from('basket_runs').select('*').eq('plan_week_id', weekId));
  },
  /** Marks a delivery's list as ready for Claude to fill the Sainsbury's basket (again, if it was done before).
   *  With emptyFirst, Claude empties the trolley before filling it. */
  async requestRun(weekId: string, delivery: 'sun' | 'tue', emptyFirst = false): Promise<BasketRun> {
    return must(await db().from('basket_runs').upsert(
      { plan_week_id: weekId, delivery, status: 'requested', empty_first: emptyFirst, requested_at: new Date().toISOString(), finished_at: null, summary: null },
      { onConflict: 'plan_week_id,delivery' },
    ).select().single());
  },
  async listProducts(householdId: string): Promise<Product[]> {
    return must(await db().from('products').select('*').eq('household_id', householdId));
  },

  async getTicks(weekId: string): Promise<{ delivery: 'sun' | 'tue'; item_key: string; ticked: boolean }[]> {
    return must(await db().from('shopping_ticks').select('delivery, item_key, ticked').eq('plan_week_id', weekId));
  },

  async setTick(weekId: string, delivery: 'sun' | 'tue', itemKey: string, ticked: boolean): Promise<void> {
    must(await db().from('shopping_ticks').upsert(
      { plan_week_id: weekId, delivery, item_key: itemKey, ticked }, { onConflict: 'plan_week_id,delivery,item_key' },
    ));
  },

  async approveWeek(weekId: string): Promise<void> {
    must(await db().rpc('approve_week', { p_week: weekId }));
  },

  /** Asks the propose-week function for a menu now, instead of waiting for Friday 7pm. */
  async proposeNow(weekStart: string): Promise<string> {
    const { data, error } = await getSupabase().functions.invoke('propose-week', { body: { weekStart } });
    if (error) {
      const context = (error as { context?: Response }).context;
      const detail = context ? await context.json().then((b: { error?: string }) => b.error).catch(() => null) : null;
      throw new Error(detail ?? error.message);
    }
    return (data as { result: string }).result;
  },

  /** Recipes cooked for dinner in the 14 days before a week, so the planner can avoid repeats. */
  async recentDinnerIds(householdId: string, weekStart: string): Promise<string[]> {
    const from = new Date(`${weekStart}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 14);
    const weeks = must<{ id: string }[]>(await db().from('plan_weeks').select('id').eq('household_id', householdId)
      .gte('week_start', from.toISOString().slice(0, 10)).lt('week_start', weekStart));
    if (!weeks.length) return [];
    const rows = must<{ recipe_id: string | null }[]>(await db().from('meal_slots').select('recipe_id')
      .in('plan_week_id', weeks.map((w) => w.id)).eq('slot', 'dinner').eq('mode', 'cook'));
    return rows.map((r) => r.recipe_id).filter((x): x is string => !!x);
  },

  /** Asks the generate-hero Edge Function for a new photo (about $0.034 each). Returns the new image path. */
  async generateHero(recipeId: string): Promise<string> {
    const { data, error } = await getSupabase().functions.invoke('generate-hero', { body: { recipeId } });
    if (error) {
      const context = (error as { context?: Response }).context;
      const detail = context ? await context.json().then((b: { error?: string }) => b.error).catch(() => null) : null;
      throw new Error(detail ?? error.message);
    }
    return (data as { path: string }).path;
  },

  /** Saves "Have it again?" for a recipe; null clears it (Undo). */
  async rateRecipe(recipeId: string, rating: 'up' | 'down' | null): Promise<void> {
    must(await db().from('recipes').update({ rating, rated_at: rating ? new Date().toISOString() : null }).eq('id', recipeId));
  },

  /** Asks the generate-step-photo Edge Function for one step's photo. Returns the new image path. */
  async generateStepPhoto(recipeId: string, stepId: string, replace = false, asked = false,
    opts: { hint?: string; replaceOwn?: boolean } = {}): Promise<string> {
    const { data, error } = await getSupabase().functions.invoke('generate-step-photo', { body: { recipeId, stepId, replace, asked, ...opts } });
    if (error) {
      const context = (error as { context?: Response }).context;
      const detail = context ? await context.json().then((b: { error?: string }) => b.error).catch(() => null) : null;
      throw new Error(detail ?? error.message);
    }
    return (data as { path: string }).path;
  },

  /** Asks Claude to sync this week to Cookidoo again (e.g. after it couldn't). */
  async requestCookidooSync(weekId: string): Promise<void> {
    must(await db().rpc('request_cookidoo_sync', { p_week: weekId }));
  },

  /** This week's Cookidoo sync, or null before the week is approved. */
  async getCookidooRun(weekId: string): Promise<CookidooRun | null> {
    return must<CookidooRun | null>(await db().from('cookidoo_runs').select('*').eq('plan_week_id', weekId).maybeSingle());
  },

  /** The recipe behind a breakfast or lunch you added (found by its name's slug, or created as a small component). */
  async addMealRecipe(householdId: string, name: string, tag: 'Breakfast' | 'Lunch'): Promise<Recipe> {
    const slug = slugify(name);
    const existing = must<Recipe | null>(await db().from('recipes').select('*').eq('household_id', householdId).eq('slug', slug).maybeSingle());
    if (existing) return toRecipe(existing);
    return toRecipe(must<Recipe>(await db().from('recipes').insert({
      household_id: householdId, slug, title: name, kind: 'component', source: 'own_doc', base_portions: 2, tags: [tag],
      status: 'active', toddler_ok: true, finish_minutes: 10,
    }).select('*').single()));
  },

  /** Start fresh: clears the plans and Spar list now and leaves the trolley and My Week for the Mac's tasks. */
  async startFresh(householdId: string): Promise<string> {
    return must<string>(await db().rpc('start_fresh', { p_household: householdId }));
  },
  async getFreshStart(householdId: string): Promise<FreshStart | null> {
    return must<FreshStart | null>(await db().from('fresh_starts').select('*').eq('household_id', householdId).order('requested_at', { ascending: false }).limit(1).maybeSingle());
  },

  /** What's in the freezer (and cooked things in the fridge), soonest use-by first. */
  async listPrepared(householdId: string): Promise<PreparedItem[]> {
    return must(await db().from('prepared_items').select('*').eq('household_id', householdId).gt('portions', 0).order('use_by', { ascending: true, nullsFirst: false }));
  },
  async addPrepared(householdId: string, item: Omit<PreparedItem, 'id' | 'household_id'>): Promise<PreparedItem> {
    return must(await db().from('prepared_items').insert({ household_id: householdId, ...item }).select().single());
  },
  /** Sets how many portions are left; 0 removes it. */
  async setPreparedPortions(id: string, portions: number): Promise<void> {
    if (portions <= 0) must(await db().from('prepared_items').delete().eq('id', id));
    else must(await db().from('prepared_items').update({ portions }).eq('id', id));
  },
  /** The fridge and cupboard: staples (have / low / out) and things you've added. */
  async listPantry(householdId: string): Promise<PantryEntry[]> {
    type Row = { id: string; staple_status: StapleStatus | null; qty: number | null; unit: string | null; location: string; ingredients: { name: string } | { name: string }[] };
    const rows = must<Row[]>(await db().from('pantry_items').select('id, staple_status, qty, unit, location, ingredients(name)')
      .eq('household_id', householdId).neq('location', 'freezer'));
    const nameOf = (i: Row['ingredients']) => (Array.isArray(i) ? i[0]?.name : i?.name) ?? '';
    return rows.map((r) => ({
      id: r.id, name: nameOf(r.ingredients), location: r.location === 'fridge' ? 'fridge' as const : 'cupboard' as const,
      qty: r.qty === null ? null : Number(r.qty), unit: r.unit, staple: r.staple_status,
    })).sort((a, b) => a.name.localeCompare(b.name));
  },
  async addPantryItem(householdId: string, name: string, location: 'fridge' | 'cupboard', qty: number | null = null, unit: string | null = null): Promise<PantryEntry> {
    const ing = must<{ id: string; name: string }>(
      await db().from('ingredients').upsert({ household_id: householdId, name: name.trim() }, { onConflict: 'household_id,name' }).select('id, name').single());
    const row = must<{ id: string }>(await db().from('pantry_items').insert({ household_id: householdId, ingredient_id: ing.id, qty, unit, location }).select('id').single());
    return { id: row.id, name: ing.name, location, qty, unit, staple: null };
  },
  async removePantryItem(id: string): Promise<void> {
    must(await db().from('pantry_items').delete().eq('id', id));
  },

  /** Whether a dinner reheats well (and so also makes the next day's lunch). */
  async setReheatsWell(recipeId: string, value: boolean): Promise<void> {
    must(await db().from('recipes').update({ reheats_well: value }).eq('id', recipeId));
  },

  /** Saves an edited recipe in one transaction (see recipeSavePayload). Each step keeps its photo. */
  async saveRecipe(original: RecipeDetail, fields: RecipeEdit, ingredients: RecipeIngredient[], steps: RecipeStep[]): Promise<void> {
    const p = recipeSavePayload(original, fields, ingredients, steps);
    must(await db().rpc('save_recipe', { p_recipe_id: original.id, p_fields: p.fields, p_ingredients: p.ingredients, p_steps: p.steps }));
  },

  /** The latest "Rework with Claude" request for a recipe, unless dismissed. */
  async getRework(recipeId: string): Promise<RecipeRework | null> {
    return must<RecipeRework | null>(await db().from('recipe_reworks').select('*').eq('recipe_id', recipeId).order('requested_at', { ascending: false }).limit(1).maybeSingle());
  },
  async requestRework(householdId: string, recipeId: string, request: string): Promise<RecipeRework> {
    return must(await db().from('recipe_reworks').insert({ household_id: householdId, recipe_id: recipeId, request }).select().single());
  },
  async retryRework(id: string): Promise<void> {
    must(await db().from('recipe_reworks').update({ status: 'requested', requested_at: new Date().toISOString(), started_at: null, finished_at: null, summary: null }).eq('id', id));
  },
  async dismissRework(id: string): Promise<void> {
    must(await db().from('recipe_reworks').delete().eq('id', id));
  },

  /** Recipe links you've pasted, newest first (finished ones stay until dismissed). */
  async listImports(householdId: string): Promise<RecipeImport[]> {
    return must(await db().from('recipe_imports').select('*').eq('household_id', householdId).order('requested_at', { ascending: false }).limit(20));
  },
  /** Asks Claude on the Mac to convert a recipe page for this household. */
  async requestImport(householdId: string, url: string, note: string | null): Promise<RecipeImport> {
    return must(await db().from('recipe_imports').insert({ household_id: householdId, url, note }).select().single());
  },
  async retryImport(id: string): Promise<void> {
    must(await db().from('recipe_imports').update({ status: 'requested', requested_at: new Date().toISOString(), started_at: null, finished_at: null, summary: null }).eq('id', id));
  },
  async dismissImport(id: string): Promise<void> {
    must(await db().from('recipe_imports').delete().eq('id', id));
  },

  /** A photo's address. With a width, a smaller copy (about a tenth of the size), resized by Supabase. */
  heroUrl(path: string, width?: number): string {
    const transform = width ? { transform: { width, resize: 'contain' as const, quality: 70 } } : undefined;
    return getSupabase().storage.from('recipe-images').getPublicUrl(path, transform).data.publicUrl;
  },

  /** Saves a photo for a step (replacing any earlier one on the card) and returns its storage path. */
  async uploadStepPhoto(householdId: string, stepId: string, photo: Blob): Promise<string> {
    const path = `${householdId}/steps/${stepId}-${Date.now()}.jpg`; // new name each time: no stale cached photo
    const { error } = await getSupabase().storage.from('recipe-images').upload(path, photo, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw new Error(error.message);
    must(await db().from('recipe_steps').update({ image_path: path, image_source: 'own' }).eq('id', stepId));
    return path;
  },
};
export type Repo = typeof repo;
