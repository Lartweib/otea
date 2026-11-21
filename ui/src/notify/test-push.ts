import type { Platform } from '../home-screen.ts';
import { type PlainKey, t } from '../i18n/i18n.ts';
import type { TestPush } from '../types.ts';

// Where to look on this phone when a push the service took never shows: Android's own switch for
// the installed app (which the page cannot read), iPhone's Settings, or the browser's.
const IF_NOT_HERE: Record<Platform, PlainKey> = {
  android: 'testPush.ifNotAndroid',
  ios: 'testPush.ifNotIos',
  other: 'testPush.ifNotOther',
};

// A test push's answer in plain words. `blocked`: the push service took it, but this phone cannot
// show it (the permission is denied), so the answer says where to allow it. `here`: sent from the
// phone itself, which then says where to look if it does not arrive (TS-2).
export function testPushWords(
  answer: TestPush,
  { blocked = false, here }: { blocked?: boolean; here?: Platform } = {},
): string {
  const { result, status, detail } = answer;
  const code = status ?? 0;
  if (result === 'off') return t('testPush.off');
  if (result === 'sent') {
    if (blocked) return `${t('testPush.sent')} ${t('notify.androidBlocked')}`;
    return here ? `${t('testPush.sent')} ${t(IF_NOT_HERE[here])}` : t('testPush.sent');
  }
  if (result === 'gone') return t('testPush.gone', { status: code });
  if (status === null) return t('testPush.network', { detail: detail || '—' });
  return detail
    ? t('testPush.refused', { status: code, detail })
    : t('testPush.refusedPlain', { status: code });
}
