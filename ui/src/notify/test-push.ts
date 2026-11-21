import type { Platform } from '../home-screen.ts';
import { t } from '../i18n/i18n.ts';
import type { TestPush } from '../types.ts';

// Where to look on this phone when a push the service took never shows: Android's own switch for
// the installed app (which the page cannot read), iPhone's Settings, or the browser's.
const IF_NOT_HERE = {
  android: 'testPush.ifNotAndroid',
  ios: 'testPush.ifNotIos',
  other: 'testPush.ifNotOther',
} as const satisfies Record<Platform, string>;

// The installed app's name, as the phone's settings list it: one app opens every project, by the
// one manifest (TS-30).
export const APP_NAME = 'Otea';

// A test push's answer in plain words. `blocked`: the push service took it, but this phone cannot
// show it (the permission is denied), so the answer says where to allow it. `here`: sent from the
// phone itself, which then says where to look if it does not arrive (TS-2); `desk`: sent from the
// desk, which says where to look on the phone.
export function testPushWords(
  answer: TestPush,
  {
    blocked = false,
    here,
    desk = false,
  }: { blocked?: boolean; here?: Platform; desk?: boolean } = {},
): string {
  const app = APP_NAME;
  const { result, status, detail } = answer;
  const code = status ?? 0;
  if (result === 'off') return t('testPush.off');
  if (result === 'sent') {
    if (blocked) return `${t('testPush.sent')} ${t('notify.androidBlocked', { app })}`;
    if (desk) return `${t('testPush.sent')} ${t('testPush.ifNot', { app })}`;
    if (here === 'other') return `${t('testPush.sent')} ${t('testPush.ifNotOther')}`;
    return here ? `${t('testPush.sent')} ${t(IF_NOT_HERE[here], { app })}` : t('testPush.sent');
  }
  if (result === 'gone') return t('testPush.gone', { status: code });
  if (status === null) return t('testPush.network', { detail: detail || '—' });
  return detail
    ? t('testPush.refused', { status: code, detail })
    : t('testPush.refusedPlain', { status: code });
}
