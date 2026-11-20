// The files scripts/stage-cli.mjs copies from the checkout's root into stage/otea, which the
// installer carries as resources/otea: the package and its lock (npm ci reads them), the license,
// and the notices of the fonts the UI bundles, which their license asks to ship with them.
export const ROOT_FILES = [
  'package.json',
  'package-lock.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
];
