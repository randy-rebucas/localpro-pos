import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Project-wide rule overrides
  {
    rules: {
      // Downgrade to warning — pervasive across lib/scripts; will be addressed incrementally
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow unused catch variables prefixed with _ or named 'error'/'e'/'err'
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_|^error$|^err$|^e$|Error$",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Allow require() in plain JS scripts (CommonJS)
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
