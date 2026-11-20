import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { thirdPartyNotices } from './notices-build.ts';

// The fonts the UI bundles are under the SIL Open Font License, which asks that their notices go
// with them: THIRD_PARTY_NOTICES.md (#458) ships beside the built UI, so in ui/dist and in the
// desktop installer that carries it.
describe('the third-party notices in the built UI', () => {
  it('are emitted beside the app, as the repository has them', async () => {
    const emitted: { type: string; fileName: string; source: string }[] = [];
    const plugin = thirdPartyNotices();
    const hook = plugin.generateBundle as unknown as (this: unknown) => void;

    await hook.call({ emitFile: (file: (typeof emitted)[number]) => emitted.push(file) });

    const notices = readFileSync(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
    expect(plugin.apply).toBe('build');
    expect(emitted).toEqual([
      { type: 'asset', fileName: 'THIRD_PARTY_NOTICES.md', source: notices },
    ]);
  });
});
