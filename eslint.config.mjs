import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Scene objects are imperative by design: uniforms and attributes are
    // written every frame inside useFrame, outside React's render.
    files: ["src/components/globe/**"],
    rules: { "react-hooks/immutability": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Each workspace package has its own lint setup.
    "services/**",
    "packages/**",
    "examples/**",
  ]),
]);

export default eslintConfig;
