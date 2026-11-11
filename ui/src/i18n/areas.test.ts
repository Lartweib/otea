import { describe, expect, it } from 'vitest';
import { board as enBoard } from './en/board.ts';
import { boardStudio as enBoardStudio } from './en/board-studio.ts';
import { common as enCommon } from './en/common.ts';
import { detail as enDetail } from './en/detail.ts';
import { phone as enPhone } from './en/phone.ts';
import { shell as enShell } from './en/shell.ts';
import { studio as enStudio } from './en/studio.ts';
import { studioEditor as enStudioEditor } from './en/studio-editor.ts';
import { studioHome as enStudioHome } from './en/studio-home.ts';
import { studioPreview as enStudioPreview } from './en/studio-preview.ts';
import { surfaces as enSurfaces } from './en/surfaces.ts';
import { toca as enToca } from './en/toca.ts';
import { en } from './en.ts';
import { board as esBoard } from './es/board.ts';
import { boardStudio as esBoardStudio } from './es/board-studio.ts';
import { common as esCommon } from './es/common.ts';
import { detail as esDetail } from './es/detail.ts';
import { phone as esPhone } from './es/phone.ts';
import { shell as esShell } from './es/shell.ts';
import { studio as esStudio } from './es/studio.ts';
import { studioEditor as esStudioEditor } from './es/studio-editor.ts';
import { studioHome as esStudioHome } from './es/studio-home.ts';
import { studioPreview as esStudioPreview } from './es/studio-preview.ts';
import { surfaces as esSurfaces } from './es/surfaces.ts';
import { toca as esToca } from './es/toca.ts';
import { es } from './es.ts';

// The catalog is split by area so the slices never edit the same file: every key lives in exactly
// one area, and the Spanish area holds exactly the keys of its English one.
const AREAS = {
  common: [enCommon, esCommon],
  shell: [enShell, esShell],
  toca: [enToca, esToca],
  board: [enBoard, esBoard],
  detail: [enDetail, esDetail],
  surfaces: [enSurfaces, esSurfaces],
  studio: [enStudio, esStudio],
  phone: [enPhone, esPhone],
  studioPreview: [enStudioPreview, esStudioPreview],
  studioEditor: [enStudioEditor, esStudioEditor],
  studioHome: [enStudioHome, esStudioHome],
  boardStudio: [enBoardStudio, esBoardStudio],
} as const;

describe('i18n areas', () => {
  it('puts every key in one area only', () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const [area, [english]] of Object.entries(AREAS)) {
      for (const key of Object.keys(english)) {
        const other = seen.get(key);
        if (other) twice.push(`${key} in ${other} and ${area}`);
        seen.set(key, area);
      }
    }
    expect(twice).toEqual([]);
    expect([...seen.keys()].sort()).toEqual(Object.keys(en).sort());
  });

  it.each(Object.entries(AREAS))(
    'says every %s key in Spanish too',
    (_area, [english, spanish]) => {
      expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
    },
  );

  it('builds both catalogs from the same keys', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});
