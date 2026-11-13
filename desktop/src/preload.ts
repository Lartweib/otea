// The window's preload (sandboxed, bundled to preload.cjs): it draws the update notice over any page
// and gives the project picker, and only the picker, its few calls into the main process.
import { contextBridge, ipcRenderer } from 'electron';
import { clearNotice, drawNotice, type NoticeView } from './notice.ts';

ipcRenderer.on('desktop:notice', (_event, view: NoticeView | null) => {
  const draw = () => {
    if (!view) return clearNotice(document);
    drawNotice(document, view, {
      act: () => ipcRenderer.send('desktop:notice-act'),
      dismiss: () => ipcRenderer.send('desktop:notice-dismiss'),
    });
  };
  if (document.body) draw();
  else window.addEventListener('DOMContentLoaded', draw, { once: true });
});

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('oteaDesktop', {
    state: () => ipcRenderer.invoke('picker:state'),
    openFolder: () => ipcRenderer.invoke('picker:open-folder'),
    createProject: () => ipcRenderer.invoke('picker:create'),
    openRecent: (root: string) => ipcRenderer.invoke('picker:open-recent', root),
    forget: (root: string) => ipcRenderer.invoke('picker:forget', root),
  });
}
