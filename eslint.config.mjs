import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import tseslint from "typescript-eslint";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: { "@eslint-community/eslint-comments": eslintComments },
    rules: {
      // Every disable says why; no blanket or unpaired disables. Unused disables: `reportUnusedDisableDirectives`.
      "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      "@eslint-community/eslint-comments/disable-enable-pair": "error",
    },
  },
  // TypeScript: type-aware rules.
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: ["test", "describe", "it", "suite"] },
          ],
        },
      ],
      // Numbers print predictably in text; the rule stays on for null, undefined, booleans, RegExp, any and objects.
      // Options replace the preset's (the rule's own defaults are looser): every flag is spelled out.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowAny: false,
          allowBoolean: false,
          allowNever: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      // No `@ts-*` directives at all (the preset still allows `@ts-expect-error` with a description).
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false },
      ],
      // Stylistic: flags `() => setX(…)` shorthand arrows (~90 hits), no bugs found.
      "@typescript-eslint/no-confusing-void-expression": "off",
      // No casts (`as const` stays allowed) and no `!`: narrow with guards, parse with Zod or fix the source type.
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      // Stylistic rules that `pnpm lint:fix` fixes unaided (the rest of stylisticTypeChecked stays off).
      "@typescript-eslint/array-type": "error",
      "@typescript-eslint/ban-tslint-comment": "error",
      "@typescript-eslint/consistent-generic-constructors": "error",
      "@typescript-eslint/consistent-indexed-object-style": "error",
      // Off for its type-aware extension `@typescript-eslint/dot-notation` below (the base rule can misreport TS code).
      "dot-notation": "off",
      "@typescript-eslint/dot-notation": "error",
      "@typescript-eslint/no-inferrable-types": "error",
      "@typescript-eslint/prefer-function-type": "error",
      "@typescript-eslint/prefer-includes": "error",
      "@typescript-eslint/prefer-regexp-exec": "error",
      "@typescript-eslint/prefer-string-starts-ends-with": "error",
    },
  },
  // Tailwind classes (in `className`, `cn`, `cva`): unknown, conflicting, duplicate and non-canonical ones.
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: { "better-tailwindcss": { entryPoint: "src/app/globals.css" } },
    rules: {
      // `dark` is no utility: it is the class the theme script puts on <html> (and on sections that stay dark), which
      // the `dark` custom variant in globals.css matches.
      "better-tailwindcss/no-unknown-classes": ["error", { ignore: ["^dark$"] }],
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-concatenated-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-deprecated-classes": "error",
      "better-tailwindcss/enforce-canonical-classes": "error",
      "better-tailwindcss/no-unnecessary-whitespace": "error",
      // Class order is Prettier's job (prettier-plugin-tailwindcss); two tools would fight over it.
      "better-tailwindcss/enforce-consistent-class-order": "off",
      // Line wrapping is Prettier's job as well.
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
    },
  },
  // JavaScript (config files, E2E scripts): no type information.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated by `pnpm db:types`; edits would be overwritten.
    "src/lib/supabase/database.types.ts",
  ]),
]);

export default eslintConfig;
