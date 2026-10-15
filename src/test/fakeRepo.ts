import type { Member, Staple } from '../lib/types';

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
    saveSettings: vi.fn(async () => {}),
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
  };
}
export type FakeRepo = ReturnType<typeof fakeRepo>;
