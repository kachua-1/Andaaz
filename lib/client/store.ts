// Browser storage (IndexedDB) for recipes and the original recordings.
// Everything stays on this device; nothing is uploaded except to Sarvam for processing.

import type { Recipe } from "@/lib/types";

const DB_NAME = "andaaz";
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("recipes")) d.createObjectStore("recipes", { keyPath: "id" });
      if (!d.objectStoreNames.contains("media")) d.createObjectStore("media");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(store: "recipes" | "media", mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = op(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function listRecipes(): Promise<Recipe[]> {
  const all = await run<Recipe[]>("recipes", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const getRecipe = (id: string) => run<Recipe | undefined>("recipes", "readonly", (s) => s.get(id));
export const saveRecipe = (r: Recipe) => run<void>("recipes", "readwrite", (s) => s.put(r));
export const saveMedia = (id: string, blob: Blob) => run<void>("media", "readwrite", (s) => s.put(blob, id));
export const getMedia = (id: string) => run<Blob | undefined>("media", "readonly", (s) => s.get(id));
const deleteMedia = (id: string) => run<void>("media", "readwrite", (s) => s.delete(id));

export async function deleteRecipe(r: Recipe): Promise<void> {
  await run<void>("recipes", "readwrite", (s) => s.delete(r.id));
  if (r.mediaId) await deleteMedia(r.mediaId);
  if (r.diaryImageId) await deleteMedia(r.diaryImageId);
}

export async function clearEverything(): Promise<void> {
  await run<void>("recipes", "readwrite", (s) => s.clear());
  await run<void>("media", "readwrite", (s) => s.clear());
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
