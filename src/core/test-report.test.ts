import { describe, expect, it } from 'vitest';
import { compareReports, parseTestReport } from './test-report.ts';

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="vitest tests" tests="4" failures="1" errors="0" time="1.2">
  <testsuite name="src/tip.test.ts" tests="4" failures="1" skipped="1">
    <testcase classname="src/tip.test.ts" name="tip &gt; rounds up" time="0.01"/>
    <testcase classname="src/tip.test.ts" name="tip &gt; splits &amp; rounds" time="0.02">
      <failure message="expected 3 to be 4" type="AssertionError">AssertionError: expected 3 to be 4
    at src/tip.test.ts:12:5</failure>
    </testcase>
    <testcase classname="src/tip.test.ts" name="tip &gt; later" time="0">
      <skipped/>
    </testcase>
    <testcase classname="src/tip.test.ts" name="tip &gt; throws" time="0.01">
      <error message="boom"/>
    </testcase>
  </testsuite>
</testsuites>`;

const JEST = JSON.stringify({
  numTotalTests: 3,
  numPassedTests: 2,
  numFailedTests: 1,
  testResults: [
    {
      name: '/repo/src/tip.test.ts',
      assertionResults: [
        { fullName: 'tip rounds up', title: 'rounds up', status: 'passed', failureMessages: [] },
        {
          fullName: 'tip splits',
          title: 'splits',
          status: 'failed',
          failureMessages: ['Error: expected 3 to be 4\n    at tip.test.ts:12'],
        },
        { fullName: 'tip later', title: 'later', status: 'pending', failureMessages: [] },
      ],
    },
  ],
});

describe('parseTestReport', () => {
  it('reads a JUnit XML report: each case, its file, its status and the failure message', () => {
    const report = parseTestReport(JUNIT);
    expect(report?.format).toBe('junit');
    expect(report?.cases.map((c) => [c.name, c.status])).toEqual([
      ['tip > rounds up', 'passed'],
      ['tip > splits & rounds', 'failed'],
      ['tip > later', 'skipped'],
      ['tip > throws', 'failed'],
    ]);
    expect(report?.cases[1]?.file).toBe('src/tip.test.ts');
    expect(report?.cases[1]?.message).toContain('expected 3 to be 4');
    expect(report?.cases[3]?.message).toBe('boom');
    expect(report?.totals).toEqual({ passed: 1, failed: 2, skipped: 1 });
  });

  it('reads the JSON vitest and jest write: pending and todo count as skipped', () => {
    const report = parseTestReport(JEST);
    expect(report?.format).toBe('json');
    expect(report?.totals).toEqual({ passed: 1, failed: 1, skipped: 1 });
    expect(report?.cases[1]).toMatchObject({
      name: 'tip splits',
      file: '/repo/src/tip.test.ts',
      status: 'failed',
    });
    expect(report?.cases[1]?.message).toContain('expected 3 to be 4');
  });

  it('is null for anything that is not a test report', () => {
    expect(parseTestReport('{"name":"otea","version":"1.0.0"}')).toBeNull();
    expect(parseTestReport('<html><body>hi</body></html>')).toBeNull();
    expect(parseTestReport('PASS src/tip.test.ts')).toBeNull();
    expect(parseTestReport('{not json')).toBeNull();
  });
});

describe('compareReports', () => {
  it('names what fails for the first time, what still fails, what was fixed, what is new', () => {
    const before = parseTestReport(JUNIT);
    const after = parseTestReport(
      JUNIT.replace(
        '<testcase classname="src/tip.test.ts" name="tip &gt; rounds up" time="0.01"/>',
        '<testcase classname="src/tip.test.ts" name="tip &gt; rounds up"><failure message="now off by one"/></testcase><testcase classname="src/tip.test.ts" name="tip &gt; brand new"/>',
      ).replace('<error message="boom"/>', ''),
    );
    if (!before || !after) throw new Error('both parse');
    const diff = compareReports(before, after);
    expect(diff.newlyFailing.map((c) => c.name)).toEqual(['tip > rounds up']);
    expect(diff.stillFailing.map((c) => c.name)).toEqual(['tip > splits & rounds']);
    expect(diff.fixed.map((c) => c.name)).toEqual(['tip > throws']);
    expect(diff.added.map((c) => c.name)).toEqual(['tip > brand new']);
    expect(diff.removed).toEqual([]);
  });
});
