import { RejectedRequest } from './errors.ts';
import { lanTransport, type PhoneTransport } from './transports.ts';

// LAN access while otea serve runs: opening it starts a listener on each of this computer's private
// addresses, at the server's own port, beside the one on 127.0.0.1; closing it stops them. What
// gets in is still lan.ts's policy (a private address naming this computer, a device token); this
// only opens and shuts the door. Otea never touches the firewall or the network settings.

export type LanHosts = { addresses: string[]; names: string[] };

export type Fetch = (request: Request, env?: unknown) => Response | Promise<Response>;

export type StopListening = () => Promise<void>;

export type LanNetwork = {
  // This computer's private addresses and the .local name that resolves to one, looked up each time
  // the LAN opens (the Wi-Fi may have changed since the server started).
  hosts(): Promise<LanHosts>;
  // Answers on one address at the port with the server's app, until stopped.
  listen(fetch: Fetch, address: string, port: number): Promise<StopListening>;
};

export type LanAccess = {
  isOpen(): boolean;
  // The local network's door while it is open.
  transport(): PhoneTransport | undefined;
  open(): Promise<void>;
  close(): Promise<void>;
};

type Opened = { transport: PhoneTransport; stops: StopListening[] };

function unavailable(message: string): RejectedRequest {
  return new RejectedRequest(409, 'transport_unavailable', message);
}

export function lanAccess(
  fetch: Fetch,
  port: () => number,
  network: LanNetwork | undefined,
): LanAccess {
  let opened: Opened | undefined;
  // One change at a time: an open and a close sent together run in order.
  let queue: Promise<void> = Promise.resolve();
  const serially = (change: () => Promise<void>) => {
    const next = queue.then(change);
    queue = next.catch(() => undefined);
    return next;
  };
  const stopAll = (stops: StopListening[]) =>
    Promise.all(stops.map((stop) => stop())).then(() => {});
  const open = async () => {
    if (opened) return;
    if (!network)
      throw unavailable('This server cannot open the local network; restart otea serve');
    const { addresses, names } = await network.hosts();
    const stops: StopListening[] = [];
    for (const address of addresses) {
      try {
        stops.push(await network.listen(fetch, address, port()));
      } catch (error) {
        await stopAll(stops);
        const reason = error instanceof Error ? error.message : String(error);
        throw unavailable(`Could not listen on ${address}:${port()} (${reason})`);
      }
    }
    opened = { transport: lanTransport([...names, ...addresses]), stops };
  };
  const close = async () => {
    const was = opened;
    opened = undefined;
    if (was) await stopAll(was.stops);
  };
  return {
    isOpen: () => opened !== undefined,
    transport: () => opened?.transport,
    open: () => serially(open),
    close: () => serially(close),
  };
}

// A door opened by the caller, who already listens on every interface (tests, and servers given
// their addresses up front): open from the start, nothing to stop.
export function openLan(hosts: LanHosts): LanAccess {
  let transport: PhoneTransport | undefined = lanTransport([...hosts.names, ...hosts.addresses]);
  return {
    isOpen: () => transport !== undefined,
    transport: () => transport,
    open: async () => {
      transport ??= lanTransport([...hosts.names, ...hosts.addresses]);
    },
    close: async () => {
      transport = undefined;
    },
  };
}
