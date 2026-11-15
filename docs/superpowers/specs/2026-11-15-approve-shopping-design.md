# Approve week: the shopping list, then Sainsbury's

Agreed with the owner on 15 Nov 2026. This is a small change, so the plan is at the end.

## Why

After approving the week, the owner wants the shopping list in front of them straight away, with one tap to send it
to Sainsbury's. Today they have to go to the Shop tab and tap Ready for Sainsbury's for each delivery.

## What happens

1. Tapping **Approve week** approves the week, as now (the Cookidoo sync starts too), then opens a sheet over the
   Week tab: "Your shopping".
2. The sheet shows the same content as the Shop tab, built by the same code, so the two can't disagree:
   - **Check the freezer first**, when a dinner uses a freezer batch;
   - the other-shop switches and lists;
   - each delivery's list, with its tick-offs (Sunday and Tuesday, or "Your shop" with one delivery a week).
3. One **Send to Sainsbury's** button sends every delivery at once: one fill request for each. It's disabled until
   the freezer check is answered. Once pressed, the sheet says Claude fills the trolleys within 15 minutes while the
   Mac is on, and shows **Done**.
4. **Not now** closes the sheet. Everything stays on the Shop tab, which is unchanged.
5. If the week was already sent before (approved, then back to draft, then approved again), the button reads
   **Send to Sainsbury's again (tops up only)**.

## Not included

- No change to how Claude fills the trolley, and no checkout or delivery slots. The app only asks for a fill, as the
  Shop tab does today.
- Empty and refill stays on the Shop tab.

## Approaches considered

1. **The sheet reuses the Shop tab's content (chosen).** One list, so the sheet and the Shop tab always agree.
2. Go to the Shop tab after approving. Less work, but it's not the pop-up the owner asked for, and it still needs a
   tap for each delivery.
3. A separate summary list in the sheet. It would be a second list that could drift from the Shop tab.

## Plan (inline, no subagents)

1. **Refactor:**
   - move the Shop tab's body into `Shopping({ weekStart?, inSheet? })` in `src/screens/shop/Shopping.tsx`;
   - `ShopList` keeps the page title and SparList, then renders `<Shopping />`;
   - with `weekStart`, `Shopping` uses that week once it's approved, instead of `pickShoppingWeek`;
   - the existing ShopList tests stay green.
2. **Tests first,** in `src/screens/week/WeekView.test.tsx`:
   - Approve week opens "Your shopping", with the Sunday and Tuesday lists;
   - Send to Sainsbury's calls `requestRun` for both deliveries;
   - it's disabled while the freezer check is unanswered;
   - Not now closes the sheet.
3. **Build it:** `inSheet` hides the per-delivery Ready buttons and adds the one Send bar. `WeekView` opens
   `ShoppingSheet` after a successful approve.
4. **Finish:** `npm test` and `npm run build`, then commit. Don't push until the owner approves.
