# Several projects and a phone

## Several projects

One Otea server runs per computer (per Otea home, `$OTEA_HOME`), and it serves every project at once: each registered project, and each local one (`otea init --local`) where `otea serve` was run. Each project has its own page on it, `http://127.0.0.1:4400/p/<project id>/`, with its API under the same path (`/p/<id>/api/…`).

```sh
cd ~/code/api && otea serve      # starts the server; opens api's page
cd ~/code/web && otea serve      # Otea already runs on this computer: opens web's page on it
cd ~/code/web && otea open       # the same, without trying to start anything
```

- **One sign-in for all.** The browser signs in once (`otea serve` or `otea open` from any project); the session works in every project's page. The project menu at the top left and **All projects** (Todos los proyectos) open another project in the same window, never a new tab, and nothing turns read-only.
- **One phone pairing for all.** Opening the local network, choosing Tailscale and pairing a phone are the computer's, not a project's: a paired phone and its home-screen shortcut open every project, and the shortcut opens the project you had open last. A paired device is yours: it sees all your projects, and revoking it (Settings › Phone, `otea devices revoke`) is what protects them.
- **Ids repeat across projects**: each project numbers its own items, so `PED-1` exists in each. Views that span projects (All projects) show the project's name next to each id.
- **Agents are unchanged**: the CLI and the MCP server find the project from the folder they run in, with or without the server. The MCP server `otea connect` prints is pinned to the project (`otea mcp --project <id>`): an agent's MCP server that finds itself in another project's folder refuses to write there (exit 7, `forbidden`) and says which project it is pinned to.
- The server keeps its own state in the Otea home: `ui-token` (the sign-in key), `machine.db` (paired devices, the phone transport, whether the local network is open, notification targets, the local projects it serves), `push-keys.json` and, while it runs, `serve.json`. Agents in a separate Otea home (`OTEA_HOME=…`) get a server of their own; give it another port (`otea serve --port 4401`).

## A phone: on the same network, or through Tailscale

`otea serve` answers this computer only (127.0.0.1). A phone reaches it through a **phone transport**, set once for the computer (not per project); the transports are interchangeable, and whichever carries the phone, it pairs once with a code shown on this computer, gets its own device token, and only paired devices get in:

- **Local network** (the default): **Open to the local network** in Settings › Phone (or `otea phone lan --open`, from any folder) makes the running `otea serve` also listen on this computer's network addresses, plain HTTP, same Wi-Fi only, without a restart. The choice is kept, so every `otea serve` after (the desktop app's too) starts open; **Close to the network** (or `otea phone lan --close`) stops listening there, and paired phones stay paired but cannot reach Otea off this computer until it opens again. `otea serve --lan` opens it for that run only.
- **Tailscale**: `otea phone tailscale` gives Otea an HTTPS address on your tailnet, `https://<machine>.<tailnet>.ts.net`, that your own devices reach from anywhere.
- **Otea relay**: a future service. It is not available yet: `otea phone relay` and Configuración say so.

```sh
otea phone lan --open       # opens the local network now (on the running otea serve) and from now on
otea phone lan --close      # closes it again; paired phones stay paired
otea serve --lan            # opens it for this run only; prints the LAN address, a pairing code and its QR code
otea phone tailscale        # sets Tailscale up for this project (see below)
otea phone status           # the transport, its URL, whether Otea answers there, the paired devices
otea phone lan              # back to the local network
otea devices list           # the paired devices, with when each was last seen
otea devices revoke <id>    # its token stops working at once
```

The terminal and **Pair a phone** in Settings › Phone (`#/lan`, this computer's signed-in browser only; Preferences links there) show a QR code for the chosen transport: `http://<lan-ip>:<port>/pair#code=XXXX-XXXX` on the local network, `https://<machine>.<tailnet>.ts.net/pair#code=XXXX-XXXX` on Tailscale. The code lasts 10 minutes, works once, and is thrown away after 5 wrong tries; **New code** shows another. Opening **Pair a phone** shows a fresh code too, with its 10 minutes ahead, unless the current one was issued or read by a phone in the last minute (another tab, `otea serve`, or a phone pairing with it right now). The phone trades it for its own device token (an HTTP-only cookie, `Secure` over HTTPS; only its SHA-256 is stored), and each device can be revoked from the same page. A request from the network must come from a private address (including Tailscale's 100.64.0.0/10), name one of this computer's IP addresses as its host (never a DNS name), and carry a device token; without one it reaches only the pairing screen. Pairing attempts are limited to 10 a minute per address. Traffic on the LAN is plain HTTP, so use it on a network you trust, and use Tailscale when away instead of opening a port. Only this computer's signed-in browser opens or closes the local network (`POST /api/lan/open`, `POST /api/lan/close`); a paired phone or anything a proxy forwarded is refused. The first time, Windows may ask whether to let Otea through its firewall; Otea never changes the firewall or the network settings itself. **Pair a phone** on a closed local network opens it and shows the code in one step.

When this computer's `<hostname>.local` resolves (mDNS) to one of those addresses, the QR code and the terminal use it first, so a home-screen shortcut survives a new DHCP address; the same link by IP is printed and shown beside it for phones that cannot resolve `.local`. The server answers that one name besides its IPs; any other host name is refused.

After pairing, the phone suggests adding Otea to its home screen (a web app manifest and icons, served before pairing too; no service worker, which browsers refuse on plain HTTP). Each project's page offers its own shortcut, named after the project and opening it, so several projects never make several icons all called Otea. On iOS the home-screen app keeps its own storage, apart from Safari: it opens on the pairing screen and pairs once more, by typing a new code. On Android over plain HTTP, Chrome adds a shortcut rather than installing the app.

### Tailscale

`otea phone tailscale` (or **Settings › Phone › Tailscale** in the UI) takes these steps on this computer, and stops at the first one that is missing, saying what to do:

1. Finds the `tailscale` CLI: on `PATH`, then where the installers put it (`C:\Program Files\Tailscale\tailscale.exe` on Windows, the app or Homebrew on macOS, `/usr/bin` and friends on Linux). When it is missing, it prints how to install it (`winget install --id tailscale.tailscale`, `brew install --cask tailscale`, or Tailscale's install script, and the download page); **Otea never installs anything.**
2. Checks that Tailscale is logged in. When it is not, it says to run `tailscale up` and log in once in the browser; `otea phone tailscale --login` runs `tailscale up` for you.
3. Checks that the tailnet has MagicDNS and HTTPS certificates on (they are on by default on new tailnets); when not, it points at the DNS page of the admin console.
4. Runs `tailscale serve --bg --https=443 http://127.0.0.1:<port>` (the running `otea serve`'s port, or `--port`): Tailscale terminates HTTPS with an automatic certificate and forwards to Otea, for your tailnet only (`serve`, never `funnel`). If `https://<machine>.<tailnet>.ts.net/` already forwards elsewhere, it leaves it alone and says how to free it.
5. Makes Tailscale the phone transport: the pairing QR now carries the HTTPS URL. On the phone: install the Tailscale app, log in with the same account, and scan Otea's QR code.

What `tailscale serve` forwards comes from this computer, so Otea tells it apart by its host (the tailnet name) and its `X-Forwarded-For`, never takes it for this computer's own browser, and still asks for a device token. A forwarded request that no chosen transport expects is refused. The HTTPS certificate is public: the machine's name on the tailnet is listed in the Certificate Transparency logs. `otea phone lan` goes back to the local network (and says how to stop `tailscale serve`); exit 20 (`transport_unavailable`) means Tailscale is not ready yet, or the relay was chosen.

### Notifications

On a phone over HTTPS (Tailscale), **Preferences › Notifications** (Avisos) turns on Web Push: the phone's browser subscribes with the server's VAPID key pair (made on the first `otea serve`, kept in `push-keys.json` in the Otea home with owner-only permissions); a notice names its project and opens it and `otea serve` posts each notice to that browser's push service, encrypted for it (aes128gcm) and to no other host. On iPhone, Safari allows it only for Otea added to the Home Screen; over the local network's plain HTTP no browser allows it, and Preferences says so. The desktop app shows the same notices as the system's notifications (see `desktop/README.md`).

What is told, each a switch, all on by default: something is your turn (a review, or an agent's question via `otea ask`), an agent answered your note, an item got stuck (an agent went quiet holding its lease). A burst arrives as one ("3 things are yours"), an item is told about at most once every five minutes, and optional quiet hours (off by default) keep it silent. A notice carries a title, the item's id and title and where tapping it leads (the item, or Your turn for a burst); nothing else from the item. Unpairing a phone unsubscribes it, and a subscription its push service reports gone (404, 410) is dropped. The API: `GET /api/notify`, `POST /api/notify/subscribe` (a paired device on HTTPS), `/api/notify/unsubscribe`, `/api/notify/prefs`, and the desktop app's `GET /api/notify/stream` (this computer only).
