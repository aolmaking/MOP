// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      sourceType: "module",
    },
    rules: {
      // Nest constructor-injection params are conventionally unused in
      // subclasses/base services and DTO fields are read via reflection --
      // the underscore-prefix escape hatch is enough signal without
      // banning the common `constructor(private readonly x: Y)` shape.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
