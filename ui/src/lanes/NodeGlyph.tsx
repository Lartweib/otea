import { type Look, lookGlyph } from './looks.ts';

type NodeGlyphProps = {
  look: Look;
  // 24 for a row's node (on its knockout), 14 or 16 for the mini nodes of crumbs, menus and children.
  size?: number;
  ground?: 'ground' | 'sheet';
  // The node's shared-piece key, "{id}:node" (the morph pairs them).
  dataS?: string;
  className?: string;
};

// A node, as rows and mini nodes draw it (SPEC §4.1, mock:1390-1391).
export function NodeGlyph({ look, size = 24, ground, dataS, className }: NodeGlyphProps) {
  const row = size === 24;
  const on = ground ?? (row ? 'ground' : 'sheet');
  const knockout = row
    ? `<circle class="ko" r="6"${on === 'sheet' ? ' style="fill:var(--sheet)"' : ''}/>`
    : '';
  return (
    <svg
      className={className ?? (row ? 'nd' : 'cn')}
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      aria-hidden="true"
      data-s={dataS}
      data-leaf={row ? '' : undefined}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the glyphs are fixed markup of this file's sibling
      dangerouslySetInnerHTML={{ __html: knockout + lookGlyph(look, on) }}
    />
  );
}
