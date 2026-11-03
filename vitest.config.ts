import { configDefaults, defineConfig } from 'vitest/config';

// These suites run the CLI against a real git repo, and every command spawns git (and some spawn
// Node itself). On a loaded Windows runner a spawn takes seconds, so the default budgets (5s per
// test, 10s per hook) time out a beforeEach that only runs five commands. They get their own.
const SPAWNS_PROCESSES = [
  'src/cli/**/*.test.ts',
  'src/mcp/**/*.test.ts',
  'src/app/project.test.ts',
  'src/app/home.test.ts',
  'src/app/migrate.test.ts',
];

export default defineConfig({
  test: {
    execArgv: ['--disable-warning=ExperimentalWarning'],
    setupFiles: ['src/test-setup.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'unit', exclude: [...configDefaults.exclude, ...SPAWNS_PROCESSES] },
      },
      {
        extends: true,
        test: {
          name: 'processes',
          include: SPAWNS_PROCESSES,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
