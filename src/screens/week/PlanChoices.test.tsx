import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '../../lib/household';
import { fakeRepo, PARTNER, YOU, type FakeRepo } from '../../test/fakeRepo';
import PlanChoicesScreen from './PlanChoices';

const h = vi.hoisted(() => ({ repo: null as unknown as FakeRepo }));
vi.mock('../../lib/repo', () => ({ get repo() { return h.repo; } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ householdId: 'h1' }) }));

const WEEK = '2026-11-23';
let open: import('vitest').MockInstance<typeof window.open>;
beforeEach(() => {
  h.repo = fakeRepo();
  h.repo.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, prep_days: [], adventure: 1, weekday_dinner_max_min: 30 });
  h.repo.listPrepared.mockResolvedValue([{ id: 'p1', household_id: 'h1', recipe_id: null, name: 'Chilli', portions: 2, location: 'freezer', made_on: '2026-11-01', use_by: null }]);
  open = vi.spyOn(window, 'open').mockReturnValue({ opener: {} } as Window);
});
afterEach(() => open.mockRestore());

const page = (q = `?week=${WEEK}`) => render(
  <MemoryRouter initialEntries={[`/plan${q}`]}>
    <Routes>
      <Route path="/plan" element={<PlanChoicesScreen />} />
      <Route path="/week" element={<p>Week tab</p>} />
    </Routes>
  </MemoryRouter>,
);
const group = (name: string) => screen.findByRole('group', { name });

test('filled in from the usual week', async () => {
  page();
  expect(await screen.findByRole('heading', { name: 'Plan with Claude' })).toBeInTheDocument();
  expect(within(await group('You')).getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(await group('Partner')).getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'false');
  expect(within(await group('Weeknight dinners take at most')).getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1', { selector: '[aria-live]' })).toBeInTheDocument();
  expect(within(await group('Use these up')).getByRole('button', { name: /Chilli \(2 portions, freezer\)/ })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('checkbox', { name: "Make this week's changes my usual" })).not.toBeInTheDocument();
});

test('a night off goes with the plan request; the usual week is left alone', async () => {
  page();
  await userEvent.click(within(await group('Nights off')).getByRole('button', { name: 'Wed' }));
  await userEvent.type(screen.getByLabelText('Anything else?'), 'something lighter');
  await userEvent.click(screen.getByRole('button', { name: 'Plan with Claude' }));
  expect(h.repo.requestWeekPlan).toHaveBeenCalledWith('h1', WEEK, 'something lighter', false, expect.objectContaining({ nightsOff: ['2026-11-25'] }));
  expect(h.repo.saveUsualWeek).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith(expect.stringContaining('https://claude.ai/new?q='), '_blank');
  expect(decodeURIComponent(open.mock.calls[0][0] as string)).toMatch(/Plan the week of Mon 23 Nov \(2026-11-23\).*something lighter/);
  expect(await screen.findByText('Week tab')).toBeInTheDocument();
});

test("ticking the box makes this week's changes usual, but never the nights off", async () => {
  page();
  await userEvent.click(within(await group('Partner')).getByRole('button', { name: 'Fri' }));
  await userEvent.click(within(await group('Nights off')).getByRole('button', { name: 'Sat' }));
  await userEvent.click(screen.getByRole('checkbox', { name: "Make this week's changes my usual" }));
  await userEvent.click(screen.getByRole('button', { name: 'Plan with Claude' }));
  expect(h.repo.saveUsualWeek).toHaveBeenCalledWith('h1', expect.not.objectContaining({ nightsOff: expect.anything() }), [{ memberId: PARTNER.id, weekday: 4, office: true }]);
  expect(h.repo.requestWeekPlan).toHaveBeenCalledWith('h1', WEEK, null, false, expect.objectContaining({ nightsOff: ['2026-11-28'], office: expect.objectContaining({ [PARTNER.id]: [4], [YOU.id]: [0] }) }));
});

test('a longer prep day has at least 2 hours; unpicked, its usual time comes back', async () => {
  page();
  const prep = await group('Longer prep days');
  const times = await group('Time to cook each evening');
  await userEvent.click(within(prep).getByRole('button', { name: 'Sun' }));
  expect(within(times).getByRole('button', { name: /^Sunday, 2 hr/ })).toBeInTheDocument();
  await userEvent.click(within(prep).getByRole('button', { name: 'Sun' }));
  expect(within(times).getByRole('button', { name: /^Sunday, 1 hr/ })).toBeInTheDocument();
});

test('tapping a day moves its time on: 1 hr → 1½ hr', async () => {
  page();
  const times = await group('Time to cook each evening');
  await userEvent.click(within(times).getByRole('button', { name: /^Tuesday, 1 hr/ }));
  expect(within(times).getByRole('button', { name: /^Tuesday, 1½ hr/ })).toBeInTheDocument();
});

test("when the Claude app can't be opened, the choices are kept and a link opens it", async () => {
  open.mockReturnValue(null);
  page(`?week=${WEEK}&replace=1`);
  await userEvent.click(await screen.findByRole('button', { name: 'Plan with Claude' }));
  expect(h.repo.requestWeekPlan).toHaveBeenCalledWith('h1', WEEK, null, true, expect.anything());
  expect(await screen.findByText('Your choices are saved.')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Open the Claude app' });
  expect(decodeURIComponent(link.getAttribute('href')!)).toMatch(/Replan the week of Mon 23 Nov/);
});

test('a time that is not one of the steps moves to the next step up', async () => {
  h.repo.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, cooking_minutes: { tue: 75 } });
  page();
  const times = await group('Time to cook each evening');
  await userEvent.click(within(times).getByRole('button', { name: /^Tuesday, 75 min/ }));
  expect(within(times).getByRole('button', { name: /^Tuesday, 1½ hr/ })).toBeInTheDocument();
});

test('a weeknight limit set before (40 min) shows as chosen', async () => {
  h.repo.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, weekday_dinner_max_min: 40 });
  page();
  expect(within(await group('Weeknight dinners take at most')).getByRole('button', { name: '40 min' })).toHaveAttribute('aria-pressed', 'true');
});

test('only a Monday can be planned', async () => {
  page('?week=2026-11-25');
  expect(await screen.findByText(/No week to plan/)).toBeInTheDocument();
});

test('a 5-day plan offers nights off Monday to Friday only', async () => {
  h.repo.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, default_plan_days: 5 });
  page();
  const off = await group('Nights off');
  expect(within(off).queryByRole('button', { name: 'Sat' })).not.toBeInTheDocument();
  expect(screen.getByText(/^5 dinners/)).toBeInTheDocument();
});
