import type { BoardStudioPage } from '../selection.ts';
import { EditorPage } from './editor/EditorPage.tsx';
import { StudioHome } from './home/StudioHome.tsx';

// The board Studio's pages: the home and a board's editor. The home slice moves `#/studio` here and
// removes today's Studio once the home is built.
export function BoardStudio({ page, canWrite }: { page: BoardStudioPage; canWrite: boolean }) {
  if (page.kind === 'board')
    return <EditorPage key={page.board} board={page.board} canWrite={canWrite} />;
  return <StudioHome canWrite={canWrite} />;
}
