import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

// Minimal, low-maintenance ESLint setup for this monorepo.
//
// Goal: catch "used a variable/prop that was never declared" bugs
// (ReferenceError at runtime) automatically in CI and locally, since this
// bug class has bitten this project multiple times (components using
// `locale`/`currency` via `t(locale, ...)` without declaring it as a prop,
// or callers forgetting to pass it down). `no-undef` (part of
// `js.configs.recommended`) is the rule that catches this.
//
// Kept intentionally small: only `js.configs.recommended`, no stylistic
// rules, no framework-specific plugins. Run with `npm run lint`.
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "apps/web/.next/**",
      "db/**",
      "backups/**",
      "docs/**"
    ]
  },
  // apps/web: browser + JSX
  {
    files: ["apps/web/src/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        process: "readonly"
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off", // avoid noisy false positives on JSX-only usages
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  // apps/api, apps/printer-service, packages/shared, tests: Node.js / ESM
  {
    files: [
      "apps/api/src/**/*.js",
      "apps/printer-service/src/**/*.js",
      "packages/shared/src/**/*.js",
      "tests/**/*.mjs"
    ],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off"
    }
  }
];
