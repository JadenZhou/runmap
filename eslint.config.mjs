import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/", "**/node_modules/", "server/data/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["server/**/*.ts", "*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
);
