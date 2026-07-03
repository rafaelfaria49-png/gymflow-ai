import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React Three Fiber usa elementos intrínsecos do three (mesh, ambientLight, etc.)
  // e props como `args`/`position`/`intensity` que o react/no-unknown-property
  // não reconhece. Escopo restrito ao pipeline 3D (POC) — não afeta o resto do app.
  {
    files: ["src/components/three/**/*.{ts,tsx}", "src/app/poc-3d/**/*.{ts,tsx}"],
    rules: {
      "react/no-unknown-property": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
