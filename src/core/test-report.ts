// A test run's report, read from the two shapes most tools write: JUnit XML (JUnit, pytest, Go via
// gotestsum, Godot's GUT, vitest and jest with a reporter) and the JSON vitest and jest write. A
// file in neither shape is not a report.
export type TestStatus = 'passed' | 'failed' | 'skipped';

export type TestCase = {
  // The file or class the case belongs to, as the report names it ('' when it names none).
  file: string;
  name: string;
  status: TestStatus;
  // What a failing case said, as the report has it.
  message?: string;
};

export type TestReport = {
  format: 'junit' | 'json';
  cases: TestCase[];
  totals: Record<TestStatus, number>;
};

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
      if (name[0] === '#') {
        const code =
          name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    });
}

function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, key, double, single] of text.matchAll(
    /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    if (key) out[key] = decode(double ?? single ?? '');
  }
  return out;
}

function totalsOf(cases: readonly TestCase[]): Record<TestStatus, number> {
  const totals = { passed: 0, failed: 0, skipped: 0 };
  for (const c of cases) totals[c.status] += 1;
  return totals;
}

function parseJunit(text: string): TestReport | null {
  if (!/<testsuites?\b/.test(text)) return null;
  const cases: TestCase[] = [];
  // Each suite names the file its cases come from when a case does not.
  for (const suite of text.matchAll(/<testsuite\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testsuite>)/g)) {
    const suiteName = attributes(suite[1] ?? '').name ?? '';
    for (const found of (suite[2] ?? '').matchAll(
      /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g,
    )) {
      const attrs = attributes(found[1] ?? '');
      const body = found[2] ?? '';
      const failure = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
      const file = attrs.file ?? attrs.classname ?? suiteName;
      const name = attrs.name ?? '';
      if (failure) {
        const said = decode(failure[3] ?? '').trim() || attributes(failure[2] ?? '').message || '';
        cases.push({ file, name, status: 'failed', ...(said ? { message: said } : {}) });
      } else if (/<skipped\b/.test(body)) cases.push({ file, name, status: 'skipped' });
      else cases.push({ file, name, status: 'passed' });
    }
  }
  return { format: 'junit', cases, totals: totalsOf(cases) };
}

const JSON_STATUS: Record<string, TestStatus> = {
  passed: 'passed',
  failed: 'failed',
  pending: 'skipped',
  skipped: 'skipped',
  todo: 'skipped',
  disabled: 'skipped',
};

function parseJson(text: string): TestReport | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const results = (data as { testResults?: unknown } | null)?.testResults;
  if (!Array.isArray(results)) return null;
  const cases: TestCase[] = [];
  for (const result of results as { name?: unknown; assertionResults?: unknown }[]) {
    const file = typeof result?.name === 'string' ? result.name : '';
    const assertions = Array.isArray(result?.assertionResults) ? result.assertionResults : [];
    for (const a of assertions as {
      fullName?: unknown;
      title?: unknown;
      status?: unknown;
      failureMessages?: unknown;
    }[]) {
      const status = JSON_STATUS[String(a?.status)] ?? 'skipped';
      const name = String(a?.fullName ?? a?.title ?? '');
      const messages = Array.isArray(a?.failureMessages) ? a.failureMessages.map(String) : [];
      const message = messages.join('\n').trim();
      cases.push({ file, name, status, ...(status === 'failed' && message ? { message } : {}) });
    }
  }
  return { format: 'json', cases, totals: totalsOf(cases) };
}

// The report a file holds, or null when it is not one.
export function parseTestReport(text: string): TestReport | null {
  const start = text.trimStart();
  if (start.startsWith('{')) return parseJson(start);
  if (start.startsWith('<')) return parseJunit(start);
  return null;
}

export type ReportChange = {
  // Failing now, passing (or missing) in the run before.
  newlyFailing: TestCase[];
  // Failing in both runs.
  stillFailing: TestCase[];
  // Failing before, passing now.
  fixed: TestCase[];
  added: TestCase[];
  removed: TestCase[];
};

const keyOf = (c: TestCase) => `${c.file}\u0000${c.name}`;

// What changed from one run to the next, case by case (a case is its file and name).
export function compareReports(before: TestReport, after: TestReport): ReportChange {
  const was = new Map(before.cases.map((c) => [keyOf(c), c]));
  const now = new Set(after.cases.map(keyOf));
  const change: ReportChange = {
    newlyFailing: [],
    stillFailing: [],
    fixed: [],
    added: [],
    removed: before.cases.filter((c) => !now.has(keyOf(c))),
  };
  for (const c of after.cases) {
    const old = was.get(keyOf(c));
    if (!old) change.added.push(c);
    if (c.status === 'failed') {
      if (old?.status === 'failed') change.stillFailing.push(c);
      else change.newlyFailing.push(c);
    } else if (c.status === 'passed' && old?.status === 'failed') change.fixed.push(c);
  }
  return change;
}
