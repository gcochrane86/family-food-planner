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
