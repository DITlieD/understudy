import type { AuditEntry } from "../model/types";

export type AuditPersist = (entry: AuditEntry) => void | Promise<void>;

export type AuditLog = {
  write: (entry: AuditEntry) => Promise<void>;
  list: () => AuditEntry[];
};

export function createAuditLog(persist?: AuditPersist): AuditLog {
  const memory: AuditEntry[] = [];
  return {
    async write(entry) {
      memory.push(entry);
      if (persist) {
        await persist(entry);
      }
    },
    list() {
      return [...memory];
    },
  };
}
