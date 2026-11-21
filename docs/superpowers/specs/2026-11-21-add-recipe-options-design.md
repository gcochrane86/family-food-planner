# Add a recipe: four clear options (short design)

**Why:** the Recipes screen opened one link form that mixed websites and YouTube, beside Quick snack and Build a
roast. The owner wants clear ways to add a recipe. Approved 21 Nov 2026.

**Design**
- One "Add a recipe" button by the Recipes heading opens a panel with four options; each opens only the boxes it needs,
  then opens the Claude app with the request typed in (as before; the connector's `add_recipe` saves it):
  - **Create with Claude:** "What would you like?" (e.g. a quick salmon traybake the toddler will eat). Claude writes a
    new recipe to the house rules.
  - **From a YouTube video:** the link, "Which part?" (optional, for a long video) and anything to change.
  - **From a website:** the link and anything to change.
  - **From Cookidoo:** the link and the recipe pasted in (Cookidoo hides the method from anyone not signed in, so
    the Claude app can't read the link), plus anything to change. Saved with source `cookidoo` and the link as
    `cookidoo_own_url`, so menu syncs add the original to My Week and never copy or edit it.
    A choice (added the same day): **Keep it as Cookidoo has it** (the default: same ingredients, amounts, steps and
    settings, only put into the app's format) or **Rewrite it for our kit** (as for any other recipe).
  - Quick snack sits under them, smaller.
- Build a roast moves to a "Roasts" chip among the recipe filters; it opens the roast builder.

**Approaches:** a Cookidoo option that sends the request to Claude Code on the Mac (signed-in Chrome) was the
alternative; the owner chose pasting, which works from the phone.

**Builder's calls:** a pasted recipe is capped at 6,000 characters so the Claude link stays within URL limits; the
link check per option (YouTube needs youtube.com or youtu.be, Cookidoo needs a cookidoo address).
