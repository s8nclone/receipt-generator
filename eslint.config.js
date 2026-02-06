import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";

export default defineConfig(
  eslint.configs.recommended,
  // ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    // Ignore config files
    ignores: ["eslint.config.js", "*.config.ts", "*.config.js", "dist/**", "node_modules/**"],
  },
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Indentation & Formatting
      indent: ["error", 4],
      quotes: [
        "error",
        "double",
        { avoidEscape: true, allowTemplateLiterals: false },
      ],
      semi: ["error", "always"],
      "comma-dangle": ["error", "always-multiline"],
      "eol-last": ["error", "always"],
      "no-trailing-spaces": "error",
      "max-len": [
        "warn",
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],

      // TypeScript Specific
      // '@typescript-eslint/no-explicit-any': 'error',
      // '@typescript-eslint/no-unused-vars': ['error', {
      //     'argsIgnorePattern': '^_',
      //     'varsIgnorePattern': '^_'
      // }],
      // '@typescript-eslint/no-floating-promises': 'error',
      // '@typescript-eslint/await-thenable': 'error',
      // '@typescript-eslint/no-misused-promises': 'error',
      // '@typescript-eslint/require-await': 'error',
    },
  },
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  eslintConfigPrettier,
);
