import { defineConfig } from "vite";

export default defineConfig({
  base: "/understudy/",
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
