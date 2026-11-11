import type { Catalog } from '../i18n.ts';

// El área toca del catálogo en español.
export const toca = {
  // Te toca y Atasco
  'toca.title': 'Te toca',
  'toca.atasco': 'Atasco',
  'toca.sec.atasco': 'Atasco',
  'toca.sec.preguntas': 'Preguntas para ti',
  'toca.sec.revisiones': 'Revisiones',
  'toca.sec.propios': 'Tus propios pasos',
  'toca.sec.encamino': 'En camino',
  'toca.sec.cerrados': 'Cerrados',
  'toca.gloss.encamino': 'vuelven a ti cuando terminen',
  'toca.gloss.cerrados': 'hechos y descartados',
  'toca.empty.atasco': 'Nada atascado.',
  'toca.empty.preguntas': 'Ninguna pregunta.',
  'toca.empty.revisiones': 'Nada por revisar.',
  'toca.empty.propios': 'Ningún paso tuyo.',
  'toca.empty.encamino': 'Nada en camino.',
  'toca.empty.cerrados': 'Nada cerrado todavía.',
  'toca.dek': { one: 'Una cosa espera por ti.', other: '{count} cosas esperan por ti.' },
  'toca.dekNone': 'Nada espera por ti.',
  'toca.dekStuck': {
    one: 'Una cosa se quedó quieta.',
    other: '{count} cosas se quedaron quietas.',
  },
  'toca.dekStuckNone': 'Nada se ha quedado quieto. Los agentes dan señales.',
} satisfies Partial<Catalog>;
