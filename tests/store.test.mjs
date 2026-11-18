import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts.mjs";

test("browser storage can retry, commits writes, and keeps media in sync", async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: undefined });
  const store = await loadTsModule("../lib/client/store.ts");

  await assert.rejects(store.listRecipes(), /doesn't support local recipe storage/);
  await import("fake-indexeddb/auto");
  assert.deepEqual(await store.listRecipes(), []);

  const databasePrototype = globalThis.IDBDatabase.prototype;
  const originalTransaction = databasePrototype.transaction;
  let completed = false;
  databasePrototype.transaction = function (...args) {
    const tx = originalTransaction.apply(this, args);
    tx.addEventListener("complete", () => {
      completed = true;
    });
    return tx;
  };

  const recipe = { id: "saved", createdAt: 1, mediaId: "recording", diaryImageId: "page" };
  const blob = new Blob(["saved recording"], { type: "audio/webm" });
  try {
    await store.saveRecipe({ id: "first", createdAt: 1 });
    assert.equal(completed, true, "saveRecipe resolves only after transaction completion");
    await store.saveRecipeAndMedia(recipe, "recording", blob);
    await store.saveMedia("page", new Blob(["diary page"], { type: "image/png" }));
  } finally {
    databasePrototype.transaction = originalTransaction;
  }

  assert.equal((await store.getRecipe("saved")).id, "saved");
  assert.equal(await (await store.getMedia("recording")).text(), "saved recording");

  await assert.rejects(
    store.saveRecipeAndMedia({ createdAt: 2 }, "orphan", blob),
    (error) => error?.name === "DataError",
  );
  assert.equal(await store.getMedia("orphan"), undefined, "failed recipe writes roll back the media write");

  await store.deleteRecipe(recipe);
  assert.equal(await store.getRecipe("saved"), undefined);
  assert.equal(await store.getMedia("recording"), undefined);
  assert.equal(await store.getMedia("page"), undefined);

  await store.saveRecipe({ id: "cleared", createdAt: 3 });
  await store.saveMedia("clear-me", blob);
  await store.clearEverything();
  assert.deepEqual(await store.listRecipes(), []);
  assert.equal(await store.getMedia("clear-me"), undefined);
});
