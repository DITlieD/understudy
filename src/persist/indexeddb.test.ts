import { describe, expect, it } from "vitest";
import { openIndexedDbDriver } from "./index";

describe("indexeddb driver", () => {
  it("fails fast when IndexedDB is missing", async () => {
    await expect(openIndexedDbDriver(null)).rejects.toThrow(/IndexedDB is not available/i);
  });
});
