// The project picker (picker.html, bundled to picker.js): the window's first page when there is no
// project to reopen, and where "Open another project…" leads. It asks the main process for
// everything through the preload's window.oteaDesktop.
import { COPY, type Lang } from './copy.ts';
import type { Recent } from './recent.ts';

export type PickerState = {
  lang: Lang;
  recents: Recent[];
  // The project being opened, while it opens.
  opening?: string;
  error?: string;
};

type Desktop = {
  state(): Promise<PickerState>;
  openFolder(): Promise<PickerState>;
  createProject(): Promise<PickerState>;
  openRecent(root: string): Promise<PickerState>;
  forget(root: string): Promise<PickerState>;
};

const desktop = (window as unknown as { oteaDesktop: Desktop }).oteaDesktop;
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const CROSS =
  '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>';

function render(state: PickerState): void {
  const copy = COPY[state.lang];
  document.documentElement.lang = state.lang;
  const main = byId<HTMLElement>('picker');
  main.hidden = false;
  main.classList.toggle('opening', state.opening !== undefined);
  byId('title').textContent = state.opening ?? copy.pickerTitle;
  byId('dek').textContent = copy.pickerDek;
  byId('dek').hidden = state.opening !== undefined;
  byId('moves').hidden = state.opening !== undefined;
  const status = byId('status');
  status.hidden = state.opening === undefined;
  status.textContent = state.opening === undefined ? '' : copy.opening;
  byId('error').textContent = state.error ?? '';
  const openFolder = byId<HTMLButtonElement>('open-folder');
  openFolder.textContent = copy.openFolder;
  openFolder.onclick = () => act(desktop.openFolder());
  const create = byId<HTMLButtonElement>('create');
  create.textContent = copy.createProject;
  create.onclick = () => act(desktop.createProject());

  const recent = byId('recent');
  recent.hidden = state.recents.length === 0 || state.opening !== undefined;
  byId('recent-title').textContent = copy.recent;
  const list = byId('recent-list');
  list.replaceChildren(
    ...state.recents.map((project) => {
      const item = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'row';
      row.onclick = () => act(desktop.openRecent(project.root));
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = project.name;
      const path = document.createElement('span');
      path.className = 'path';
      // rtl keeps the end of a long path in view; the mark keeps its slashes in order.
      path.textContent = `‎${project.root}‎`;
      path.title = project.root;
      row.append(name, path);
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'forget';
      forget.title = copy.forget;
      forget.setAttribute('aria-label', `${copy.forget}: ${project.name}`);
      forget.innerHTML = CROSS;
      forget.onclick = () => act(desktop.forget(project.root));
      item.append(row, forget);
      return item;
    }),
  );
}

function act(next: Promise<PickerState>): void {
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  void next.then(render).finally(() => {
    for (const button of document.querySelectorAll('button')) button.disabled = false;
  });
}

void desktop.state().then(render);
