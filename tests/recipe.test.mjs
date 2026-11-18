import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts.mjs";

const recipeHelpers = await loadTsModule("../lib/recipe.ts");

test("speaker and clip helpers handle timestamps and missing segment pointers", () => {
  const segments = [
    { speaker: "0", start: 0, end: 2, text: "Mix the flour" },
    { speaker: "1", start: 2, end: 7, text: "Until the oil smells fragrant" },
    { speaker: "1", start: 7, end: 9, text: "Then add the sugar" },
  ];
  assert.equal(recipeHelpers.guessElderSpeaker(segments), "1");
  assert.equal(recipeHelpers.guessElderSpeaker([]), null);
  assert.deepEqual(recipeHelpers.clipRange([0, 1, 99], segments, "1"), { start: 1.8, end: 7.3 });
  assert.equal(recipeHelpers.clipRange([99], segments, "1"), null);

  const recipe = {
    elderSpeaker: "1",
    segments,
    steps: [{ segments: [1] }, { segments: [99] }],
  };
  const updated = recipeHelpers.withClips(recipe);
  assert.deepEqual([updated.steps[0].clipStart, updated.steps[0].clipEnd], [1.8, 7.3]);
  assert.equal(updated.steps[1].clipStart, null);
});

test("ingredient labels and cooking clock format estimates safely", () => {
  assert.equal(
    recipeHelpers.estimateLabel({ min: 1.5, max: 2.5, isEstimate: true, unit: "cup" }),
    "≈ 1.5–2.5 cup",
  );
  assert.equal(recipeHelpers.estimateLabel({ min: null, max: null, isEstimate: false, unit: "" }), "amount not said");
  assert.equal(recipeHelpers.formatClock(61.6), "1:02");
  assert.equal(recipeHelpers.formatClock(-2), "0:00");
});
