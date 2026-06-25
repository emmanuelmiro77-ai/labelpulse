/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/store.ts",
        "src/lib/supabase.ts",
        "src/lib/gmail.ts",
        "src/lib/pitch-utils.ts",
        "src/app/page.tsx",
        "src/components/rankings-page.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
