import { defineConfig } from 'vitest/config';
import path from 'node:path';

const raiz = __dirname;

export default defineConfig({
  resolve: {
    // Os testes ficam na raiz do monorepo, que nao declara os packages
    // como dependencia. Os aliases apontam direto para o codigo-fonte —
    // assim nao e preciso buildar nada antes de testar.
    alias: {
      '@prospector/database': path.join(raiz, 'packages/database/src/index.ts'),
      '@prospector/shared': path.join(raiz, 'packages/shared/src/index.ts'),
      '@prospector/domain': path.join(raiz, 'packages/domain/src/index.ts'),
      '@prospector/integrations': path.join(raiz, 'packages/integrations/src/index.ts'),
      '@prospector/config': path.join(raiz, 'packages/config/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Os testes de API verificam o login de verdade (401 sem cookie).
    // A copia roda com ele desligado; quem testa o desligado e
    // tests/login-desligado.test.ts, que passa o valor explicito.
    env: { LOGIN_OBRIGATORIO: 'true' },
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    // Os testes de API compartilham um unico banco. Rodar arquivos em
    // paralelo faria o `beforeEach` de um limpar os dados do outro.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      reporter: ['text', 'html'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
    },
  },
});
