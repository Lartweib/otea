import { board } from './es/board.ts';
import { common } from './es/common.ts';
import { detail } from './es/detail.ts';
import { phone } from './es/phone.ts';
import { shell } from './es/shell.ts';
import { studio } from './es/studio.ts';
import { surfaces } from './es/surfaces.ts';
import { toca } from './es/toca.ts';
import type { Catalog } from './i18n.ts';

// La interfaz en español: neutro, profesional, de tú. Las palabras de la interfaz son las del diseño
// (Otea next). Los nombres que define una plantilla (estados, campos, tipos) salen como los escribió,
// o con sus etiquetas en español si las trae; los identificadores (roles, módulos, comandos) no se
// traducen. Cada área vive en es/<área>.ts; este archivo solo las junta.
//
// Glosario
//   item              ítem (nunca «elemento»)
//   board             tablero
//   step / state      paso
//   steps             Pasos
//   list              Lista
//   table             Tabla
//   round             ronda
//   turn              turno
//   Your turn         Te toca
//   Stuck             Atasco
//   Done              Hecho
//   Discarded         Descartado
//   send back         Devolver (solo lo que devuelve la persona)
//   hand over         entregar (los agentes «entregan», nunca «devolvió»)
//   approve           aprobar
//   handoff           traspaso
//   lease             reserva
//   evidence          evidencia
//   triage            triaje
//   brief             encargo
//   template          plantilla
//   quiet             callado
//   On the way        En camino
//   Closed            Cerrados
//   Questions for you Preguntas para ti
//   Reviews           Revisiones
//   Your own steps    Tus propios pasos
//   Fold / Slide      Plegar / Deslizar
//   Expand / Reduce   Ampliar / Reducir
//   Undo              Deshacer
export const es: Catalog = {
  ...common,
  ...shell,
  ...toca,
  ...board,
  ...detail,
  ...surfaces,
  ...studio,
  ...phone,
};
