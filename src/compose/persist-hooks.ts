import type { Persistence } from "../persist";
import type { PersistHooks } from "../registry";

export function createPublishedHooks(persist: Persistence): PersistHooks {
  return {
    async loadPublished() {
      return persist.published.list();
    },
    async savePublished(items) {
      const existing = await persist.published.list();
      const keep = new Set(items.map((item) => item.id));
      for (const item of existing) {
        if (!keep.has(item.id)) {
          await persist.published.delete(item.id);
        }
      }
      for (const item of items) {
        await persist.published.save(item);
      }
    },
  };
}
