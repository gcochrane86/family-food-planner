export type MemberKind = 'adult' | 'child';

export interface Member {
  id: string;
  household_id: string;
  name: string;
  kind: MemberKind;
  birthdate: string | null;
  portion_weight: number;
}

/** weekday: 0 = Monday … 6 = Sunday */
export interface WeekPattern {
  member_id: string;
  weekday: number;
  office: boolean;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DeliverySlot {
  day: Weekday;
  start: string; // "19:00"
  end: string; // "20:00"
}

export interface Settings {
  weekday_dinner_max_min: number;
  default_plan_days: 5 | 7;
  shops_per_week: 1 | 2;
  delivery_slots: DeliverySlot[];
  delivery_pass: boolean;
  use_nectar: boolean;
  adventure: number; // new recipes per week
  /** Your breakfast and home-lunch options, in the order the day sheet shows them. */
  breakfasts: string[];
  lunches: string[];
}

export type RuleKind = 'substitute' | 'prefer' | 'avoid';

export interface HouseRule {
  id: string;
  household_id: string;
  kind: RuleKind;
  match: string;
  replacement: string | null;
  note: string | null;
}

export interface Equipment {
  id: string;
  household_id: string;
  code: string;
  name: string;
}

export type StapleStatus = 'have' | 'low' | 'out';

/** A cupboard staple: the pantry row plus its ingredient name. */
export interface Staple {
  id: string; // pantry_items.id
  ingredient_id: string;
  name: string;
  status: StapleStatus;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
}

// Recipes (Phase 2) ------------------------------------------------------------

export type Phase = 'prep_8pm' | 'finish' | 'reheat';
export type Protein = 'chicken' | 'fish' | 'red_meat' | 'veggie' | 'egg' | 'other';
export type Machine = 'tm7' | 'apo' | 'hy24' | 'meater' | 'hob' | 'oven' | 'kettle';

export interface RecipeIngredient {
  id?: string;
  position: number;
  group_name: string | null;
  name: string;
  qty: number | null;
  unit: string;
  note: string | null;
  qty_approx: boolean;
}

export interface RecipeStep {
  id?: string;
  phase: Phase;
  position: number;
  at_minute: number | null;
  title: string;
  body: string; // **word** is shown in bold
  machine: Machine | null;
  settings: string | null;
  timer_minutes: number | null;
  image_path: string | null;
  image_source: 'own' | 'generated' | null;
  /** Your own one-sentence description of what this step's AI photo should show. */
  photo_hint?: string | null;
}

export interface Recipe {
  id: string;
  household_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  kind: 'meal' | 'component';
  component_role: 'sauce' | 'protein' | 'veg' | 'carb' | 'bread' | null;
  source: 'hellofresh' | 'own_doc' | 'claude' | 'cookidoo' | 'web';
  protein: Protein | null;
  base_portions: number;
  reheats_well: boolean;
  freezes_well: boolean;
  toddler_ok: boolean;
  toddler_note: string | null;
  salt_per_portion_g: number | null;
  prep_minutes: number;
  finish_minutes: number;
  hands_off_minutes: number;
  tags: string[];
  equipment: string[];
  reheat: string | null;
  hero_image_path: string | null;
  hero_image_source: 'generated' | 'own' | null;
  status: 'draft' | 'active' | 'archived';
  /** "Have it again?" after cooking: 'down' keeps it out of menus; 'up' gets step photos. */
  rating: 'up' | 'down' | null;
  cookidoo_status?: 'none' | 'sent' | 'outdated';
  cookidoo_url?: string | null;
  cookidoo_portions?: number | null;
  /** The web page a 'web' recipe was converted from. */
  source_url?: string | null;
}

export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

// Planning (Phase 3) ------------------------------------------------------------

export type SlotKind = 'breakfast' | 'lunch' | 'dinner';
export type SlotMode = 'cook' | 'reheat' | 'leftovers' | 'out' | 'routine' | 'packed';

export interface PlanWeek {
  id: string;
  household_id: string;
  week_start: string; // YYYY-MM-DD, a Monday
  days: 5 | 7;
  status: 'draft' | 'approved';
  proposed_at: string;
  approved_at: string | null;
}

export interface MealSlot {
  id?: string;
  plan_week_id?: string;
  date: string;
  slot: SlotKind;
  recipe_id: string | null;
  mode: SlotMode;
  portions: number | null;
  guests: number;
  locked: boolean;
  reason: string | null;
  source_date: string | null;
  routine_choice: string | null;
  cooked_at: string | null;
  portions_verdict: 'not_enough' | 'right' | 'leftovers' | null;
  cookidoo_recipe_id?: string | null;
}

// Shopping (Phase 4) -------------------------------------------------------------

export interface WeeklyBasic {
  id?: string;
  household_id: string;
  position: number;
  name: string;
  qty: number | null;
  unit: string;
  approx: boolean;
  delivery: 'sun' | 'tue' | 'split';
}

export interface QuickItem {
  id: string;
  household_id: string;
  name: string;
  note: string | null;
  done: boolean;
  created_at: string;
}

export interface Product {
  id?: string;
  household_id: string;
  item_key: string;
  product_name: string;
  product_url: string | null;
  pack_size: number | null;
  pack_unit: string;
  price: number | null;
  pinned: boolean;
}

export interface BasketRun {
  id: string;
  plan_week_id: string;
  delivery: 'sun' | 'tue';
  status: 'requested' | 'filling' | 'done' | 'failed';
  /** Empty the Sainsbury's trolley before filling (the household changed the menu or ingredients). */
  empty_first?: boolean;
  requested_at: string;
  started_at?: string | null;
  finished_at: string | null;
  summary: string | null;
}

// Cookidoo (Phase 6) -------------------------------------------------------------

export interface CookidooRun {
  id: string;
  plan_week_id: string;
  status: 'requested' | 'filling' | 'done' | 'failed';
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  summary: string | null;
}

/** A recipe link pasted on the Recipes tab, waiting for (or converted by) Claude on the owner's Mac. */
export interface RecipeImport {
  id: string;
  household_id: string;
  url: string;
  note: string | null;
  status: 'requested' | 'importing' | 'done' | 'failed';
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  recipe_id: string | null;
  summary: string | null;
}

/** "Rework with Claude": a request to rewrite one recipe, done by the scheduled task on the owner's Mac. */
export interface RecipeRework {
  id: string;
  household_id: string;
  recipe_id: string;
  request: string;
  status: 'requested' | 'working' | 'done' | 'failed';
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  summary: string | null;
}

/** The recipe fields the editor changes. */
export interface RecipeEdit {
  title: string;
  subtitle: string | null;
  prep_minutes: number;
  finish_minutes: number;
}
