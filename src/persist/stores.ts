import type { AuditEntry, ProcedureDraft, PublishedProcedure, Trace } from "../model/types";
import type { KvDriver, StoreName } from "./driver";

export type EntityStore<T> = {
  save(item: T): Promise<void>;
  load(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  delete(id: string): Promise<void>;
};

export type Persistence = {
  traces: EntityStore<Trace>;
  drafts: EntityStore<ProcedureDraft>;
  published: EntityStore<PublishedProcedure>;
  audit: EntityStore<AuditEntry>;
  exportAuditJson: () => Promise<string>;
};

export function exportAuditLog(entries: AuditEntry[]): string {
  return JSON.stringify(entries);
}

export function createPersistence(driver: KvDriver): Persistence {
  const traces = keyedStore<Trace>(driver, "traces", (item) => item.id);
  const drafts = keyedStore<ProcedureDraft>(driver, "drafts", (item) => item.id);
  const published = keyedStore<PublishedProcedure>(driver, "published", (item) => item.id);
  const audit = keyedStore<AuditEntry>(driver, "audit", (item) => item.timestamp);
  return {
    traces,
    drafts,
    published,
    audit,
    async exportAuditJson() {
      return exportAuditLog(await audit.list());
    },
  };
}

function keyedStore<T>(
  driver: KvDriver,
  store: StoreName,
  keyOf: (item: T) => string,
): EntityStore<T> {
  return {
    async save(item) {
      await driver.put(store, requireKey(keyOf(item)), item);
    },
    async load(id) {
      return (await driver.get(store, id)) as T | undefined;
    },
    async list() {
      return (await driver.getAll(store)) as T[];
    },
    async delete(id) {
      await driver.delete(store, id);
    },
  };
}

function requireKey(key: string): string {
  if (key === "") {
    throw new Error("empty id");
  }
  return key;
}
