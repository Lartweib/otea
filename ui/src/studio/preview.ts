import type { Preset, PresetNote } from '../../../src/core/preset.ts';
import { readSamples, type Sample } from '../../../src/core/samples.ts';
import {
  draftCollectionView,
  type SampleViewOptions,
  sampleItem,
  sampleItemView,
} from '../../../src/core/views.ts';
import type { Look } from '../lanes/looks.ts';
import { stateWord } from '../preset-words.ts';
import type { CollectionView, Item, ItemView, TypeView } from '../types.ts';
import { stateLook } from './looks.ts';

// Studio's preview: a draft preset drawn with its sample items, in the shapes the server sends for
// stored ones, so the real detail, row, form and lanes draw them unchanged. The samples are read
// against the draft with the core's reader, so a draft that drops a state or a field notes it.

export type SamplesSource = { yaml: string | null; files: readonly string[] };

export type DraftPreview = {
  collection: CollectionView;
  samples: Sample[];
  notes: PresetNote[];
  items: Item[];
  view: (id: string) => ItemView | undefined;
};

// A board's sample row on the blueprint canvas: the first sample of a type the board has, read as
// the list reads a row, with its node and its state in words.
export type BoardSample = {
  id: string;
  title: string;
  type: string;
  state: string;
  node: Look;
};

export function boardSample(
  samples: readonly Sample[],
  types: readonly TypeView[],
): BoardSample | undefined {
  for (const sample of samples) {
    const type = types.find(({ name }) => name === sample.type);
    const state = type?.states.find(({ name }) => name === sample.state);
    if (!type || !state) continue;
    return {
      id: sample.id,
      title: sample.title,
      type: type.name,
      state: stateWord(type, state.name),
      node: stateLook(state, state.name === type.incomplete),
    };
  }
  return undefined;
}

export function draftPreview(
  draft: Preset,
  source: SamplesSource,
  options: SampleViewOptions,
): DraftPreview {
  const { samples, notes } = readSamples(source.yaml ?? undefined, draft, source.files);
  return {
    collection: draftCollectionView(draft, { name: options.collection }),
    samples,
    notes,
    items: samples.map((sample) => sampleItem(draft, sample, options)),
    view: (id) => {
      const sample = samples.find((candidate) => candidate.id === id);
      return sample && sampleItemView(draft, sample, options);
    },
  };
}
