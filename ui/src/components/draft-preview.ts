import type { Preset } from '../../../src/core/preset.ts';
import { readSamples } from '../../../src/core/samples.ts';
import {
  draftCollectionView,
  type SampleViewOptions,
  sampleItem,
  sampleItemView,
} from '../../../src/core/views.ts';
import type { CollectionView, Item, ItemView } from '../types.ts';

// A preset drawn with its sample items, in the shapes the server sends for stored ones, so the
// detail and its tests draw them unchanged (kept from today's Studio preview for those tests).
export function draftPreview(
  draft: Preset,
  source: { yaml: string | null; files: readonly string[] },
  options: SampleViewOptions,
): { collection: CollectionView; items: Item[]; view: (id: string) => ItemView | undefined } {
  const { samples } = readSamples(source.yaml ?? undefined, draft, source.files);
  return {
    collection: draftCollectionView(draft, { name: options.collection }),
    items: samples.map((sample) => sampleItem(draft, sample, options)),
    view: (id) => {
      const sample = samples.find((candidate) => candidate.id === id);
      return sample && sampleItemView(draft, sample, options);
    },
  };
}
