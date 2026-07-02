import { defineConfig } from 'vitest/config';

// Suite de authz do painel da clínica (H-2). Testes hermeticos: mockam a camada
// de serviço/DB e exercitam apenas os guards de role + a lógica de bind/redação
// dos controllers. Não tocam Postgres nem rede.
export default defineConfig({
  test: {
    include: ['src/api/__tests__/**/*.test.js'],
    environment: 'node',
    globals: false,
  },
});
