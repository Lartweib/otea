import type { DatabaseSync } from 'node:sqlite';
import { dropEndpoint, targetOfDevice } from '../app/notify-targets.ts';
import type { PushOutcome, PushResult, PushSender } from './push.ts';

// What a push came to, in the serve output: the device by its id alone, never the endpoint, the
// keys or the words it carried.
export function outcomeLine(who: string, outcome: PushOutcome): string {
  const { result, status, detail } = outcome;
  const code = status === null ? '' : ` (${status})`;
  if (result === 'sent') return `${who}: sent${code}`;
  if (result === 'gone') return `${who}: gone${code}, subscription dropped`;
  if (status === null) return `${who}: network error: ${detail || 'no answer'}`;
  return `${who}: refused by the push service${code}${detail ? `: ${detail}` : ''}`;
}

// A test push's answer: what the push service said, or `off` when the device has no subscription.
export type TestPush = { result: PushResult | 'off'; status: number | null; detail: string };

const WORDS = {
  es: {
    title: 'Otea · aviso de prueba',
    body: 'Si ves esto, los avisos llegan a este dispositivo.',
  },
  en: {
    title: 'Otea · test notification',
    body: 'If you see this, notifications reach this device.',
  },
} as const;

// Sends one push to a device now, past the planner, the quiet hours and the spacing: Preferencias ›
// Avisos and the desk's device list use it to see whether notifications get through. A subscription
// its push service calls gone is dropped, as a real push drops it.
export async function sendTestPush(
  machine: DatabaseSync,
  sender: PushSender,
  device: string,
  log: (line: string) => void = () => undefined,
): Promise<TestPush> {
  const target = targetOfDevice(machine, device);
  if (!target?.push) return { result: 'off', status: null, detail: '' };
  const words = WORDS[target.lang];
  const outcome = await sender.send(
    target.push,
    JSON.stringify({ ...words, tag: 'otea-test', url: '/#/' }),
  );
  log(`Otea ${outcomeLine(`test push to device ${device}`, outcome)}`);
  if (outcome.result === 'gone') dropEndpoint(machine, target.push.endpoint);
  return outcome;
}
