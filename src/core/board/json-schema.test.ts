import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boardJsonSchema } from './schema.ts';

// schemas/board.schema.json is the board.json shape agents check a draft against: it is generated
// from the zod schema, and this test keeps the two together. After a change to the schema, run
// OTEA_WRITE_BOARD_SCHEMA=1 npx vitest run src/core/board/json-schema.test.ts to write it again,
// then npm run format. The file is compared as JSON, so its formatting is the formatter's.
const FILE = new URL('../../../schemas/board.schema.json', import.meta.url);

type Node = Record<string, unknown>;

// Every key of the schema, with its dotted path.
function keysOf(node: Node, at: string): [string, Node][] {
  const own = Object.entries((node.properties ?? {}) as Record<string, Node>).flatMap(
    ([key, value]) => [[`${at}${key}`, value] as [string, Node], ...keysOf(value, `${at}${key}.`)],
  );
  const items = node.items ? keysOf(node.items as Node, `${at}[].`) : [];
  const values =
    typeof node.additionalProperties === 'object'
      ? keysOf(node.additionalProperties as Node, `${at}*.`)
      : [];
  const branches = ((node.anyOf ?? []) as Node[]).flatMap((branch) => keysOf(branch, at));
  return [...own, ...items, ...values, ...branches];
}

describe('the published JSON Schema of board.json', () => {
  it('is the zod schema, as generated', () => {
    const generated = boardJsonSchema();
    if (process.env.OTEA_WRITE_BOARD_SCHEMA)
      writeFileSync(FILE, `${JSON.stringify(generated, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FILE, 'utf8'))).toEqual(generated);
  });

  it('says what every key is for, with an example', () => {
    const undescribed = keysOf(boardJsonSchema(), '')
      .filter(([, node]) => typeof node.description !== 'string' || !Array.isArray(node.examples))
      .map(([path]) => path);
    expect(undescribed).toEqual([]);
  });

  it('lets an agent leave out the settings that have a default', () => {
    expect(boardJsonSchema().required).not.toContain('drop');
    expect(boardJsonSchema().required).toContain('steps');
  });
});
