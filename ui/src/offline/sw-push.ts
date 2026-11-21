// What the service worker does with a push and with a tap on its notification (sw.ts), pure so it
// is tested without a browser. A push carries the notice in words (the PC's notifier wrote it):
// a title, a short body, a tag (a later notice about the same item replaces the earlier one) and
// where in the app it leads: the item, or Te toca for a burst.

export type PushShown = {
  title: string;
  options: {
    body: string;
    tag?: string;
    icon: string;
    badge: string;
    data: { url: string };
  };
};

const ICON = '/icons/otea-192.png';
const HOME = '/#/';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export function pushNotification(payload: unknown): PushShown {
  const notice = (payload ?? {}) as Record<string, unknown>;
  const title = text(notice.title);
  const tag = text(notice.tag);
  return {
    title: title ?? 'Otea',
    options: {
      body: (title === undefined ? undefined : text(notice.body)) ?? '',
      ...(tag === undefined ? {} : { tag }),
      icon: ICON,
      badge: ICON,
      data: { url: text(notice.url) ?? HOME },
    },
  };
}

// Where a tap leads: a page of the app on this origin, never elsewhere.
export function clickTarget(data: unknown, origin: string): string {
  const url = text((data as { url?: unknown } | undefined)?.url) ?? HOME;
  try {
    const target = new URL(url, origin);
    if (target.origin === origin) return target.href;
  } catch {
    // not a URL: the app's home
  }
  return `${origin}${HOME}`;
}

// Android bundles the app's notifications, and a tap on the bundle opens the app without a
// notificationclick (TS-17). Opening on a project's home (Te toca), the app looks at the notices
// still shown: exactly one about an item leads there; several stay on Te toca, which lists them.
export function launchNotice(
  shown: readonly { data: unknown }[],
  here: string,
): string | undefined {
  const at = new URL(here);
  if (at.hash !== '' && at.hash !== '#/') return undefined;
  const items = shown
    .map((each) => clickTarget(each.data, at.origin))
    .filter((url) => new URL(url).hash.startsWith('#/i/'));
  return items.length === 1 ? items[0] : undefined;
}

export type WindowLike = {
  url: string;
  visibilityState?: string;
  focused?: boolean;
  postMessage(message: unknown): void;
  focus(): Promise<unknown>;
};

export type ClientsLike = {
  matchAll(): Promise<readonly WindowLike[]>;
  openWindow(url: string): Promise<unknown>;
};

// The app open already comes forward and goes to the item (the page moves itself, see
// register.ts: a reload would lose what it holds); with no app open, one opens on the item.
export async function openFromClick(target: string, clients: ClientsLike): Promise<void> {
  const origin = new URL(target).origin;
  const open = (await clients.matchAll()).filter((each) => {
    try {
      return new URL(each.url).origin === origin;
    } catch {
      return false;
    }
  });
  const best =
    open.find((each) => each.focused) ??
    open.find((each) => each.visibilityState === 'visible') ??
    open[0];
  if (!best) {
    await clients.openWindow(target);
    return;
  }
  best.postMessage({ type: 'open', url: target });
  await best.focus().catch(() => undefined);
}
