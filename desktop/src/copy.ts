// The words of the desktop app's own surfaces (the project picker, the update notice, the dialogs
// and the tray's fixed items), in the language of the system: Spanish de tú, as the web UI.
export type Lang = 'en' | 'es';

export const langOf = (locale: string): Lang =>
  locale.toLowerCase().startsWith('es') ? 'es' : 'en';

const en = {
  pickerTitle: 'Open a project',
  pickerDek: 'Pick the folder of a project, or make a new one.',
  openFolder: 'Open folder',
  createProject: 'Create project',
  recent: 'Recent',
  forget: 'Remove from the list',
  opening: (name: string) => `Opening ${name}…`,
  chooseFolder: 'Open a project folder',
  chooseNewFolder: 'Choose the folder for the new project',
  noProjectTitle: 'No Otea project here',
  noProject: (dir: string) => `${dir} is not in an Otea project yet. Create one there?`,
  cancel: 'Cancel',
  updated: 'Otea updated',
  restart: 'restart',
  available: (version: string) => `Otea ${version} is out`,
  download: 'download',
  dismiss: 'Dismiss',
  menuOpen: 'Open Otea',
  menuSwitch: 'Open another project…',
  menuRestart: (version: string) => `Restart to update to ${version}`,
  menuDownload: (version: string) => `Download Otea ${version}`,
  menuCommand: 'Install the otea command',
  menuQuit: 'Quit Otea',
  commandAsk: 'Install the otea command?',
  commandInstall:
    'Otea adds /usr/local/bin/otea so agents and terminals can run otea. macOS may ask for your password.',
  commandReplace: 'There is another otea at /usr/local/bin/otea. Replace it with this app’s?',
  install: 'Install',
  commandDone: 'otea is ready: open a new terminal and run otea.',
} as const;

export type Copy = {
  [Key in keyof typeof en]: (typeof en)[Key] extends string ? string : (typeof en)[Key];
};

const es: Copy = {
  pickerTitle: 'Abre un proyecto',
  pickerDek: 'Elige la carpeta de un proyecto, o crea uno nuevo.',
  openFolder: 'Abrir carpeta',
  createProject: 'Crear proyecto',
  recent: 'Recientes',
  forget: 'Quitar de la lista',
  opening: (name) => `Abriendo ${name}…`,
  chooseFolder: 'Abre la carpeta de un proyecto',
  chooseNewFolder: 'Elige la carpeta del proyecto nuevo',
  noProjectTitle: 'Aquí no hay un proyecto de Otea',
  noProject: (dir) => `${dir} todavía no está en un proyecto de Otea. ¿Lo creas ahí?`,
  cancel: 'Cancelar',
  updated: 'Otea se actualizó',
  restart: 'reiniciar',
  available: (version) => `Salió Otea ${version}`,
  download: 'descargar',
  dismiss: 'Cerrar',
  menuOpen: 'Abrir Otea',
  menuSwitch: 'Abrir otro proyecto…',
  menuRestart: (version) => `Reiniciar para actualizar a ${version}`,
  menuDownload: (version) => `Descargar Otea ${version}`,
  menuCommand: 'Instalar el comando otea',
  menuQuit: 'Salir de Otea',
  commandAsk: '¿Instalar el comando otea?',
  commandInstall:
    'Otea añade /usr/local/bin/otea para que los agentes y las terminales puedan usar otea. macOS puede pedirte la contraseña.',
  commandReplace: 'Ya hay otro otea en /usr/local/bin/otea. ¿Lo reemplazas por el de esta app?',
  install: 'Instalar',
  commandDone: 'otea está listo: abre una terminal nueva y usa otea.',
};

export const COPY: Record<Lang, Copy> = { en, es };
