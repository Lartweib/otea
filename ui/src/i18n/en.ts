import { board } from './en/board.ts';
import { boardStudio } from './en/board-studio.ts';
import { common } from './en/common.ts';
import { detail } from './en/detail.ts';
import { phone } from './en/phone.ts';
import { shell } from './en/shell.ts';
import { studio } from './en/studio.ts';
import { studioEditor } from './en/studio-editor.ts';
import { studioHome } from './en/studio-home.ts';
import { studioPreview } from './en/studio-preview.ts';
import { surfaces } from './en/surfaces.ts';
import { toca } from './en/toca.ts';

// The interface in English: the source every other language follows, key by key and hole by hole.
// A plural has one form per plural category, picked by its {count}.
export const en = {
  ...common,
  ...shell,
  ...toca,
  ...board,
  ...detail,
  ...surfaces,
  ...studio,
  ...boardStudio,
  ...studioHome,
  ...studioEditor,
  ...studioPreview,
  ...phone,
} as const;
