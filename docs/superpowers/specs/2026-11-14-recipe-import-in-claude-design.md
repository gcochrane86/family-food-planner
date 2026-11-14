# Recipe import in the Claude app (replacing the Mac's import task)

Date: 14 Nov 2026. Approved by the owner in chat ("Yeah build it please").

## Why
The Mac's `recipe-import` scheduled task has been off since 16 Oct 2026, so links pasted on the Recipes tab sit
unconverted. The owner wants to add recipes from the phone: paste a link into the Claude app, see the recipe and steps
there, say "push it", and have it in the app with a good main photo.

## Flow
1. The household pastes a link (web page or YouTube) into the Claude app; **Add recipe** in the app opens the Claude
   app with the link typed in (like Plan with Claude).
2. Claude calls `get_recipe_rules` (the recipe format and rules, portions, kit, meal specifications, house and
   private rules, existing recipe titles and slugs).
3. A web page: Claude reads it itself. A YouTube video: Claude calls `read_youtube`, which has Gemini watch the
   public video and write out the recipe (what's said and shown, estimates marked). Long videos: one frame every 5
   seconds above 20 minutes; a time range when the household names the part they want; over 3 hours is refused
   unless a range is given. A video Gemini can't read: Claude asks for the transcript.
4. Claude rewrites it to the house rules and shows the full recipe in the chat; the household can ask for changes.
5. "Push it": `add_recipe` checks it (`validateRecipeSeed`), refuses a slug or title that exists, saves it as a new
   recipe (add only), then makes its main photo (about 3p) from the recipe's **picture description**. A failed photo
   leaves the recipe saved and says to use Make photos.

## The main photo description
- New field `photo` in the recipe format, saved to `recipes.hero_hint` (migration 0019, up to 600 characters).
- Written by Claude like the step pictures but for the finished dish, realistic: what's on the plate and how it's
  arranged, colours and textures of the cooked food, garnish, the plate or bowl, what must not appear.
- `heroPrompt` uses it when present (the house photo style stays); the generate-hero function (Make photos) uses it
  too. New recipes from the week plan get the field as well (their photo is still made with Make photos).

## Decisions (my calls)
- Gemini model for video: `gemini-3.5-flash-lite`, default resolution; the API key is the existing
  `GOOGLE_AI_API_KEY`. Gemini's text is data for Claude, never instructions.
- Video length is read from the YouTube page when it can be; unknown length is treated as long (1 frame per 5 s).
- The app's old waiting-links list goes; the `recipe_imports` table and the Mac's playbook stay (unused) for now.
- Rework with Claude is not part of this.

## Non-goals
Step photos for new recipes (Today's hour's "Add step photos" does those); editing existing recipes.
