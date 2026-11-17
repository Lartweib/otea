import type { EventRecord } from '../../store/queries.ts';
import { parseTestReport, type TestCase } from '../test-report.ts';

// A checklist point ticked with what shows it holds: a file attached to the item (a screenshot, a
// recording), a line of an attached log, or a test that passes in an attached test report. Otea
// checks the line and the test when the agent names them, so a kept proof is one it verified.
export const POINT_PROVED = 'point_proved';

export type ProofKind = 'file' | 'log' | 'test';

export type Proof = {
  // The checklist part and the point (a choice id) it shows.
  part: string;
  point: string;
  kind: ProofKind;
  // The evidence entry it rests on, and that file's name.
  evidence: number;
  file: string;
  // A log line: its number (from 1) and its text, as the log has it.
  line?: number;
  text?: string;
  // A test: its name as the report has it.
  test?: string;
  at: string;
  by: string;
};

// The longest a log line is kept with its proof: enough to recognise it, never a whole stack.
export const PROOF_TEXT = 200;

// The proofs given since `since` (the round's start), the last one per point winning: a point
// proved again in the round is proved by the newer one.
export function proofsFrom(events: readonly EventRecord[], since?: string): Proof[] {
  const out = new Map<string, Proof>();
  for (const event of events) {
    if (event.type !== POINT_PROVED) continue;
    if (since !== undefined && event.at < since) continue;
    const { data } = event;
    const part = String(data.part ?? '');
    const point = String(data.point ?? '');
    const kind = data.kind;
    if (!part || !point || (kind !== 'file' && kind !== 'log' && kind !== 'test')) continue;
    out.set(`${part}\u0000${point}`, {
      part,
      point,
      kind,
      evidence: Number(data.evidence),
      file: String(data.file ?? ''),
      ...(typeof data.line === 'number' ? { line: data.line } : {}),
      ...(typeof data.text === 'string' ? { text: data.text } : {}),
      ...(typeof data.test === 'string' ? { test: data.test } : {}),
      at: event.at,
      by: event.actor.name,
    });
  }
  return [...out.values()];
}

// The points of each checklist part proved in the round, by part id: what the engine reads.
export function provedPoints(proofs: readonly Proof[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { part, point } of proofs) {
    const points = out[part] ?? [];
    points.push(point);
    out[part] = points;
  }
  return out;
}

// The log's line `line` (from 1), or why it cannot prove anything: past the end, or blank.
export function logLine(
  text: string,
  line: number,
): { ok: true; text: string } | { ok: false; why: string } {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (!Number.isInteger(line) || line < 1)
    return { ok: false, why: `the line must be a number from 1` };
  if (line > lines.length)
    return {
      ok: false,
      why: `it has ${lines.length} line${lines.length === 1 ? '' : 's'}`,
    };
  const said = (lines[line - 1] ?? '').trim();
  if (said === '') return { ok: false, why: `line ${line} is blank` };
  return {
    ok: true,
    text: said.length > PROOF_TEXT ? `${said.slice(0, PROOF_TEXT - 1)}…` : said,
  };
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// How a test reads in full: its file or suite, then its name.
export function testTitle(test: TestCase): string {
  return test.file ? `${test.file} › ${test.name}` : test.name;
}

// The test a report has under `wanted`: its name, or its file and name ("suite › name"), in any
// case. A report that is not one (no JUnit XML, no vitest or jest JSON) has none.
export function findTest(report: string, wanted: string): TestCase | undefined {
  const parsed = parseTestReport(report);
  if (!parsed) return undefined;
  const target = fold(wanted);
  return (
    parsed.cases.find((test) => fold(testTitle(test)) === target) ??
    parsed.cases.find((test) => fold(test.name) === target)
  );
}
