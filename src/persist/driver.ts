export const STORE_NAMES = ["traces", "drafts", "published", "audit"] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export type KvDriver = {
  get(store: StoreName, key: string): Promise<unknown | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  getAll(store: StoreName): Promise<unknown[]>;
};

export function createMemoryDriver(): KvDriver {
  const tables = new Map<StoreName, Map<string, unknown>>();
  for (const name of STORE_NAMES) {
    tables.set(name, new Map());
  }
  return {
    async get(store, key) {
      const value = requireTable(tables, store).get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(store, key, value) {
      requireTable(tables, store).set(key, structuredClone(value));
    },
    async delete(store, key) {
      requireTable(tables, store).delete(key);
    },
    async getAll(store) {
      return [...requireTable(tables, store).values()].map((value) => structuredClone(value));
    },
  };
}

function requireTable(tables: Map<StoreName, Map<string, unknown>>, store: StoreName) {
  const found = tables.get(store);
  if (!found) {
    throw new Error(`unknown store: ${store}`);
  }
  return found;
}
