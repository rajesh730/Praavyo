import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
export default defineConfig([...next, globalIgnores(['.next/**', 'integration/**']), {
  files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
  rules: { '@next/next/no-img-element': 'off' },
}]);
