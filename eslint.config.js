import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import tsparser from "@typescript-eslint/parser";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import solidPlugin from "eslint-plugin-solid";

export default [
  {
    ignores: ["src/api/**"],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    ignores: ["node_modules/", "dist/"],
    languageOptions: {
      globals: globals.browser,
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      prettier: prettierPlugin,
      solid: solidPlugin,
    },
    rules: {
      ...solidPlugin.configs.recommended.rules,
      "prettier/prettier": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": "warn",
    },
  },
  {
    files: ["**/utils/logger.ts", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
