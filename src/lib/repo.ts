import { getSupabase } from './supabase';
import { validateSettings } from './household';
import type { Equipment, Household, HouseRule, Member, Settings, Staple, StapleStatus, WeekPattern } from './types';

type Result<T> = { data: T | null; error: { message: string } | null };

function must<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const db = () => getSupabase();

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
};
export type Repo = typeof repo;
