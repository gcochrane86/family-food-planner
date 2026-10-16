import type { Settings, BasketRun, MealSlot, Member, PlanWeek, Product, QuickItem, Recipe, RecipeDetail, Staple, WeeklyBasic, CookidooRun, RecipeImport, RecipeRework, RecipeEdit, RecipeIngredient, RecipeStep } from '../lib/types';
import { DONER, HONEY, NEXT_WEEK, TACOS } from './fixtures';

export const YOU: Member = { id: 'm-you', household_id: 'h1', name: 'You', kind: 'adult', birthdate: null, portion_weight: 1.25 };
export const PARTNER: Member = { id: 'm-partner', household_id: 'h1', name: 'Partner', kind: 'adult', birthdate: null, portion_weight: 1.25 };
export const TODDLER: Member = { id: 'm-toddler', household_id: 'h1', name: 'Toddler', kind: 'child', birthdate: null, portion_weight: 0.5 };

/** Every repo function as a mock, with seed-like defaults. */
export function fakeRepo() {
  return {
    getHousehold: vi.fn(async () => ({ id: 'h1', name: 'Our household', invite_code: 'K7Q2XA' })),
    joinHousehold: vi.fn(async (): Promise<string | null> => 'h2'),
    listMembers: vi.fn(async () => [YOU, PARTNER, TODDLER]),
    saveMember: vi.fn(async (m: Member) => m),
    deleteMember: vi.fn(async () => {}),
    getWeekPattern: vi.fn(async () => [{ member_id: YOU.id, weekday: 0, office: true }]),
    setOffice: vi.fn(async () => {}),
    getSettings: vi.fn(),
    saveSettings: vi.fn(async (_householdId: string, _settings: Partial<Settings>) => {}),
    listRules: vi.fn(async () => []),
    saveRule: vi.fn(),
    deleteRule: vi.fn(async () => {}),
    listEquipment: vi.fn(async () => []),
    saveEquipment: vi.fn(),
    deleteEquipment: vi.fn(async () => {}),
    listStaples: vi.fn(async (): Promise<Staple[]> => [
      { id: 'p-paprika', ingredient_id: 'i1', name: 'Paprika', status: 'have' },
      { id: 'p-rice', ingredient_id: 'i2', name: 'Basmati rice', status: 'low' },
    ]),
    setStaple: vi.fn(async () => {}),
    addStaple: vi.fn(),
    listRecipes: vi.fn(async (): Promise<Recipe[]> => [HONEY, DONER, TACOS]),
    getRecipe: vi.fn(async (id: string): Promise<RecipeDetail | null> => ({ 'r-honey': HONEY, 'r-doner': DONER } as Record<string, RecipeDetail>)[id] ?? null),
    heroUrl: vi.fn((path: string, _width?: number) => `https://img.test/${path}`),
    getWeek: vi.fn(async (_hid: string, weekStart: string) =>
      (weekStart === NEXT_WEEK.week.week_start ? JSON.parse(JSON.stringify(NEXT_WEEK)) : { week: null, slots: [] }) as { week: PlanWeek | null; slots: MealSlot[] }),
    listBasics: vi.fn(async (): Promise<WeeklyBasic[]> => [
      { id: 'b-eggs', household_id: 'h1', position: 1, name: 'Eggs', qty: 18, unit: '', approx: false, delivery: 'sun' },
      { id: 'b-milk', household_id: 'h1', position: 2, name: 'Whole milk', qty: 3000, unit: 'ml', approx: false, delivery: 'split' },
    ]),
    saveBasic: vi.fn(async (b: WeeklyBasic) => ({ id: b.id ?? 'b-new', ...b })),
    deleteBasic: vi.fn(async () => {}),
    listQuick: vi.fn(async (): Promise<QuickItem[]> => []),
    addQuick: vi.fn(async (_hid: string, name: string): Promise<QuickItem> => ({ id: `q-${name}`, household_id: 'h1', name, note: null, done: false, created_at: '2026-10-16T08:00:00Z' })),
    setQuickDone: vi.fn(async () => {}),
    clearQuickDone: vi.fn(async () => {}),
    addMealRecipe: vi.fn(async (householdId: string, name: string, tag: 'Breakfast' | 'Lunch'): Promise<Recipe> => ({ ...TACOS, id: `r-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, household_id: householdId, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: name, kind: 'component', tags: [tag], hero_image_path: null, hero_image_source: null })),
    saveRecipe: vi.fn(async (_original: RecipeDetail, _fields: RecipeEdit, _ingredients: RecipeIngredient[], _steps: RecipeStep[]) => {}),
    getRework: vi.fn(async (): Promise<RecipeRework | null> => null),
    requestRework: vi.fn(async (householdId: string, recipeId: string, request: string): Promise<RecipeRework> => ({ id: 'w-new', household_id: householdId, recipe_id: recipeId, request, status: 'requested', requested_at: '2026-10-16T08:00:00Z', started_at: null, finished_at: null, summary: null })),
    retryRework: vi.fn(async () => {}),
    dismissRework: vi.fn(async () => {}),
    listImports: vi.fn(async (): Promise<RecipeImport[]> => []),
    requestImport: vi.fn(async (householdId: string, url: string, note: string | null): Promise<RecipeImport> => ({ id: 'i-new', household_id: householdId, url, note, status: 'requested', requested_at: '2026-10-16T08:00:00Z', started_at: null, finished_at: null, recipe_id: null, summary: null })),
    retryImport: vi.fn(async () => {}),
    dismissImport: vi.fn(async () => {}),
    getRuns: vi.fn(async (): Promise<BasketRun[]> => []),
    requestRun: vi.fn(async (weekId: string, delivery: 'sun' | 'tue'): Promise<BasketRun> => ({ id: `run-${delivery}`, plan_week_id: weekId, delivery, status: 'requested', requested_at: '2026-10-16T08:00:00Z', finished_at: null, summary: null })),
    listProducts: vi.fn(async (): Promise<Product[]> => []),
    getTicks: vi.fn(async (): Promise<{ delivery: 'sun' | 'tue'; item_key: string; ticked: boolean }[]> => []),
    setTick: vi.fn(async () => {}),
    saveSlots: vi.fn(async (_slots: MealSlot[]) => {}),
    approveWeek: vi.fn(async () => {}),
    proposeNow: vi.fn(async () => 'created'),
    recentDinnerIds: vi.fn(async (): Promise<string[]> => []),
    generateHero: vi.fn(async (recipeId: string) => `h1/hero/${recipeId}-1.jpg`),
    requestCookidooSync: vi.fn(async (_weekId: string) => {}),
    getCookidooRun: vi.fn(async (_weekId: string): Promise<CookidooRun | null> => null),
    rateRecipe: vi.fn(async (_recipeId: string, _rating: 'up' | 'down' | null) => {}),
    generateStepPhoto: vi.fn(async (recipeId: string, stepId: string, _replace?: boolean, _asked?: boolean, _opts?: { hint?: string; replaceOwn?: boolean }) => `h1/steps/${recipeId}-${stepId}-gen.jpg`),
    uploadStepPhoto: vi.fn(async (_hid: string, stepId: string) => `h1/steps/${stepId}.jpg`),
  };
}
export type FakeRepo = ReturnType<typeof fakeRepo>;
