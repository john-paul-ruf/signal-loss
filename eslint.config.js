// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

/**
 * Rule-affecting forbidden primitives inside `./src/engine/**`. Enforced by
 * `no-restricted-properties` so the exact call is rejected, not the whole
 * identifier — `Math.sqrt` inside `fx/isqrt` stays legal (§4.3).
 */
const FORBIDDEN_ENGINE_PROPERTIES = [
  { object: "Math", property: "random", message: "Engine RNG is seeded (FR-29). Use engine/rng." },
  { object: "Math", property: "hypot", message: "Implementation-defined; use fx.isqrt over squared distances." },
  { object: "Math", property: "pow", message: "Implementation-defined; use integer multiplication." },
  { object: "Math", property: "sin", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "cos", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "tan", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "asin", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "acos", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "atan", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "atan2", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "exp", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "log", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "log2", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "log10", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Math", property: "cbrt", message: "Implementation-defined across engines; forbidden in rule code." },
  { object: "Date", property: "now", message: "Wall-clock reads forbidden in the engine (FR-29)." },
  { object: "performance", property: "now", message: "Wall-clock reads forbidden in the engine (FR-29)." },
  { object: "Number", property: "toLocaleString", message: "Locale-dependent output forbidden in the engine." },
];

const FORBIDDEN_ENGINE_GLOBALS = [
  { name: "Date", message: "Wall-clock reads forbidden in the engine (FR-29); `new Date()` is a clock." },
];

const ENGINE_SORT_BAN = [
  {
    selector: "CallExpression[callee.property.name='sort'][arguments.length=0]",
    message: "Engine .sort() calls require an explicit total-order comparator (§4.3).",
  },
  {
    selector: "CallExpression[callee.property.name='toSorted'][arguments.length=0]",
    message: "Engine .toSorted() calls require an explicit total-order comparator (§4.3).",
  },
];

const RULE_PATH_FLOAT_BAN = {
  selector: "Literal[raw=/^-?[0-9]+\\.[0-9]+$/]",
  message: "Match/map/AI paths carry no float literals; every value is fx or from Tunables (§4.1, §4.3).",
};

const REPO_JSX_DANGER_BAN = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: "dangerouslySetInnerHTML is forbidden repo-wide (NFR-8, §9).",
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      ".forge/**",
      "program/**",
      "specs/**",
      "mocks/**",
      "public/**",
      "harness/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      import: importPlugin,
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": {
        node: { extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"] },
      },
    },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-danger": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "no-restricted-syntax": ["error", REPO_JSX_DANGER_BAN],

      eqeqeq: ["error", "always", { null: "always" }],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    files: ["src/engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", ...FORBIDDEN_ENGINE_GLOBALS],
      "no-restricted-properties": ["error", ...FORBIDDEN_ENGINE_PROPERTIES],
      "no-restricted-syntax": ["error", REPO_JSX_DANGER_BAN, ...ENGINE_SORT_BAN],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Every npm dependency currently declared in package.json is
              // explicitly banned inside the engine. Relative imports pass
              // through untouched. When a new npm dep lands, add it here (or
              // fail the build via lint) — the deliberate friction is the
              // point.
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "zustand",
                "zustand/*",
                "tailwindcss",
                "tailwindcss/*",
                "@fontsource/*",
                "@fontsource/**",
                "@tailwindcss/*",
                "@vitejs/*",
                "vite",
                "vite/*",
                "vite-plugin-pwa",
                "vite-plugin-pwa/*",
                "workbox-window",
                "workbox-window/*",
                "@playwright/*",
                "@axe-core/*",
                "eslint",
                "eslint/*",
                "typescript-eslint",
                "typescript-eslint/*",
                "eslint-plugin-*",
                "vitest",
                "vitest/*",
                "@vitest/*",
                "tsx",
                "tsx/*",
                "globals",
              ],
              message: "Engine has zero runtime dependencies (§2.1).",
            },
          ],
        },
      ],
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            { target: "./src/engine", from: "./src/app", message: "Engine may not import from ./src/app (§2.1)." },
            { target: "./src/engine", from: "./src/platform", message: "Engine may not import from ./src/platform (§2.1)." },
            { target: "./src/engine", from: "./src/workers", message: "Engine may not import from ./src/workers (§2.1)." },
            { target: "./src/engine", from: "./src/migrations", message: "Engine may not import from ./src/migrations (DB-owned)." },
          ],
        },
      ],
    },
  },
  {
    // fx/** is the one place `Math.sqrt` is legal — the isqrt seed. Nowhere else.
    // Remove Math.sqrt from the ban here? It was never in the ban list; sqrt is
    // permitted by default. We simply keep this block for symmetry / future-proofing.
    files: ["src/engine/fx/**/*.ts"],
    rules: {
      "no-restricted-properties": ["error", ...FORBIDDEN_ENGINE_PROPERTIES],
    },
  },
  {
    files: ["src/engine/match/**/*.ts", "src/engine/map/**/*.ts", "src/engine/ai/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        REPO_JSX_DANGER_BAN,
        ...ENGINE_SORT_BAN,
        RULE_PATH_FLOAT_BAN,
      ],
    },
  },
  {
    files: ["*.config.{js,ts}", "*.config.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
