// Browser storage (IndexedDB) for recipes and the original recordings.
// Everything stays on this device; nothing is uploaded except to Sarvam for processing.

import type { Recipe } from "@/lib/types";

const DB_NAME = "andaaz";
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser doesn't support local recipe storage. Try another browser."));
      return;
    }

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      reject(error);
      return;
    }

    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("recipes")) d.createObjectStore("recipes", { keyPath: "id" });
      if (!d.objectStoreNames.contains("media")) d.createObjectStore("media");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the local recipe database."));
  });

  dbPromise = opening;
  void opening.then(
    (connection) => {
      connection.onversionchange = () => {
        connection.close();
        if (dbPromise === opening) dbPromise = null;
      };
    },
    () => {
      // Don't keep a rejected promise forever; a later call can retry after a browser storage error.
      if (dbPromise === opening) dbPromise = null;
    },
  );
  return opening;
}

type TransactionResult<T> = { request: IDBRequest<T> } | { value: T };

function transact<T>(
  stores: Array<"recipes" | "media">,
  mode: IDBTransactionMode,
  op: (tx: IDBTransaction) => TransactionResult<T>,
): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = d.transaction(stores, mode);
        } catch (error) {
          if (dbPromise) dbPromise = null;
          reject(error);
          return;
        }

        let result = undefined as T;
        let settled = false;
        const fail = (error: unknown, fallback: string) => {
          if (settled) return;
          settled = true;
          reject(error ?? new Error(fallback));
        };

        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        tx.onerror = () => fail(tx.error, "The local cookbook transaction failed.");
        tx.onabort = () => fail(tx.error, "The local cookbook transaction was aborted.");

        try {
          const outcome = op(tx);
          if ("request" in outcome) {
            outcome.request.onsuccess = () => {
              result = outcome.request.result;
            };
            outcome.request.onerror = () =>
              fail(outcome.request.error, "The local cookbook request failed.");
          } else {
            result = outcome.value;
          }
        } catch (error) {
          try {
            tx.abort();
          } catch {
            // The transaction may already have completed or aborted.
          }
          fail(error, "The local cookbook transaction failed.");
        }
      }),
  );
}

function run<T>(
  store: "recipes" | "media",
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return transact([store], mode, (tx) => ({ request: op(tx.objectStore(store)) }));
}

function write(stores: Array<"recipes" | "media">, op: (tx: IDBTransaction) => void): Promise<void> {
  return transact(stores, "readwrite", (tx) => {
    op(tx);
    return { value: undefined };
  });
}

export async function listRecipes(): Promise<Recipe[]> {
  const all = await run<Recipe[]>("recipes", "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const getRecipe = (id: string) => run<Recipe | undefined>("recipes", "readonly", (s) => s.get(id));
export async function saveRecipe(r: Recipe): Promise<void> {
  await run("recipes", "readwrite", (s) => s.put(r));
}
export async function saveMedia(id: string, blob: Blob): Promise<void> {
  await run("media", "readwrite", (s) => s.put(blob, id));
}
export const getMedia = (id: string) => run<Blob | undefined>("media", "readonly", (s) => s.get(id));

/** Saves the recipe and its original recording/image in one atomic transaction. */
export function saveRecipeAndMedia(r: Recipe, mediaId: string, blob: Blob): Promise<void> {
  return write(["recipes", "media"], (tx) => {
    tx.objectStore("media").put(blob, mediaId);
    tx.objectStore("recipes").put(r);
  });
}

export async function deleteRecipe(r: Recipe): Promise<void> {
  await write(["recipes", "media"], (tx) => {
    tx.objectStore("recipes").delete(r.id);
    if (r.mediaId) tx.objectStore("media").delete(r.mediaId);
    if (r.diaryImageId) tx.objectStore("media").delete(r.diaryImageId);
  });
}

export function clearEverything(): Promise<void> {
  return write(["recipes", "media"], (tx) => {
    tx.objectStore("recipes").clear();
    tx.objectStore("media").clear();
  });
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
