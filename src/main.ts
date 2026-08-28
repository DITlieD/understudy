import { bootApp } from "./compose";
import { createPersistence, openIndexedDbDriver } from "./persist";

const persist = createPersistence(await openIndexedDbDriver());
await bootApp({ persist });
