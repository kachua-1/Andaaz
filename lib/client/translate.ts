// Translates a recipe's learner-facing text (English from the engine) with Sarvam Translate
// and caches it on the recipe, so each language is only paid for once.

import type { Recipe, Translation } from "@/lib/types";
import { postJson } from "./api";
import { saveRecipe } from "./store";

export async function ensureTranslation(recipe: Recipe, language: string): Promise<Recipe> {
  if (language === "en-IN" || recipe.translations[language]) return recipe;

  const texts = [
    recipe.title,
    recipe.story,
    ...recipe.steps.flatMap((s) => [s.instruction, s.sensoryCue]),
    ...recipe.ingredients.map((i) => i.name),
  ];
  const { texts: out } = await postJson<{ texts: string[] }>("/api/translate", { texts, source: "en-IN", target: language });

  let k = 2;
  const translation: Translation = {
    language,
    title: out[0],
    story: out[1],
    steps: recipe.steps.map(() => ({ instruction: out[k++], sensoryCue: out[k++] })),
    ingredients: recipe.ingredients.map(() => out[k++]),
  };
  const updated = { ...recipe, translations: { ...recipe.translations, [language]: translation } };
  await saveRecipe(updated);
  return updated;
}

/** The step text to show/narrate in `language`, falling back to English. */
export function stepText(recipe: Recipe, index: number, language: string): { instruction: string; sensoryCue: string } {
  const t = recipe.translations[language]?.steps[index];
  const s = recipe.steps[index];
  return { instruction: t?.instruction || s.instruction, sensoryCue: t?.sensoryCue ?? s.sensoryCue };
}
