import { t } from '../i18n/i18n.ts';
import type { TestPush } from '../types.ts';

// A test push's answer in plain words. `blocked`: the push service took it, but this phone cannot
// show it (Android's own switch for the installed app is off, or the browser lost its subscription),
// so the answer says where to allow it.
export function testPushWords(answer: TestPush, { blocked = false } = {}): string {
  const { result, status, detail } = answer;
  const code = status ?? 0;
  if (result === 'off') return t('testPush.off');
  if (result === 'sent') {
    return blocked ? `${t('testPush.sent')} ${t('notify.androidBlocked')}` : t('testPush.sent');
  }
  if (result === 'gone') return t('testPush.gone', { status: code });
  if (status === null) return t('testPush.network', { detail: detail || '—' });
  return detail
    ? t('testPush.refused', { status: code, detail })
    : t('testPush.refusedPlain', { status: code });
}
