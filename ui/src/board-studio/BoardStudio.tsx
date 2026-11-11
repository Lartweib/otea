import type { StudioPage } from '../selection.ts';
import { EditorPage } from './editor/EditorPage.tsx';
import { StudioHome } from './home/StudioHome.tsx';

// Studio's pages: the home (`#/studio`) and a board's editor (`#/studio/board/<id>`).
export function BoardStudio({ page, canWrite }: { page: StudioPage; canWrite: boolean }) {
  if (page.kind === 'board')
    return <EditorPage key={page.board} board={page.board} canWrite={canWrite} />;
  return <StudioHome canWrite={canWrite} />;
}
