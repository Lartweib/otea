import { configDefaults, defineConfig } from 'vitest/config';

// These suites start other processes: the CLI against a real git repo (every command spawns git,
// some spawn Node), a project made with initProject (git), or a shell running a script. On a loaded
// Windows runner a spawn takes seconds, so the default budgets (5s per test, 10s per hook) time out
// a beforeEach that only runs five commands. They get their own.
const SPAWNS_PROCESSES = [
  'src/cli/**/*.test.ts',
  'src/mcp/**/*.test.ts',
  'src/app/project.test.ts',
  'src/app/home.test.ts',
  'src/app/migrate.test.ts',
  'src/app/repos.test.ts',
  'src/server/projects.test.ts',
  'src/server/desk-only.test.ts',
  'src/server/boards.test.ts',
  'desktop/src/shims.test.ts',
];

export default defineConfig({
  test: {
    execArgv: ['--disable-warning=ExperimentalWarning'],
    setupFiles: ['src/test-setup.ts'],
    projects: [
      {
        extends: true,
        // First, on their own: running beside the suites that spawn git, Node and PowerShell, a
        // Windows runner starved them until a beforeEach that only opens a database took 10s.
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, ...SPAWNS_PROCESSES],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'processes',
          include: SPAWNS_PROCESSES,
          testTimeout: 20_000,
          hookTimeout: 30_000,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
