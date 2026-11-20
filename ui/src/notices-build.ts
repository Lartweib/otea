import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

// The repository's third-party notices (#458): the fonts the UI bundles are under the SIL Open
// Font License, which asks that their notices go with them.
const NOTICES = new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url);

// Ships THIRD_PARTY_NOTICES.md beside the built UI (ui/dist), and so in the desktop app, which
// carries ui/dist. The app never fetches it, so the service worker does not keep it.
export function thirdPartyNotices(): Plugin {
  return {
    name: 'otea-third-party-notices',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(NOTICES, 'utf8');
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.md', source });
    },
  };
}
