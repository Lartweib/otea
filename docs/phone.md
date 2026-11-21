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

### Choose how you reach Otea

**Settings › Phone** sets three options side by side and marks the one in use, read from the current state. You can switch at any time.

| Option | Needs | Gives you | You lose |
| --- | --- | --- | --- |
| **Only on this computer** (the default: the local network stays closed) | Nothing to install. | The fastest: Otea in this computer's browser, nothing open to the network. | The phone, notifications, and use away from this computer. |
| **From your phone, at home** (the local network, plain HTTP) | The phone on the same Wi‑Fi. Nothing else to install. | Quick and basic: Otea on the phone at home, paired with a code. | Use away from home, and notifications: the local network has no HTTPS, and browsers give push (a service worker) only to secure (HTTPS) pages. |
| **From anywhere, with Tailscale** (HTTPS on your tailnet) | Tailscale on the phone and on this computer, and the guided steps below. Tailscale's Personal plan is free for non-commercial use. | The most robust option: Otea away from home, over HTTPS, with notifications. | A few minutes to set it up, and a Tailscale account. |

Picking the first two opens or closes the local network right away; that is Otea's own setting. Picking Tailscale only opens its guided steps: nothing changes until they are done. Until then Tailscale is marked **to set up**, and the option that still carries the phone is marked **in use for now**; the status under the options, the steps and the notes below them all describe that option. Once `tailscale serve` forwards to Otea, picking Tailscale (or **Check again**) makes it carry the phone at once. While Tailscale carries the phone and the local network is still open, Settings › Phone says so and closes it in one click.

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

The first time Otea opens in a phone's browser, a small banner offers **Install Otea on your home screen**. It never shows inside the installed app, which it recognizes by `display-mode: standalone` or Safari's `navigator.standalone`.

- **Chrome on HTTPS** (the Tailscale name) hands Otea its own install prompt (`beforeinstallprompt`), and the banner's **Install** button opens it.
- **Where that prompt never fires**, the banner gives this browser's steps instead. That covers plain HTTP on the local network (the prompt needs a secure page), Safari on iPhone (Share › Add to Home Screen) and other browsers.
- **On iPhone**, it also says notifications reach Otea only from the Home Screen, so add it before turning them on.
- **Once dismissed**, the banner stays gone on that browser. **Preferences › App** offers it again.

### Tailscale

**Settings › Phone › From anywhere, with Tailscale** walks you through it. Otea reads each step on this computer (with `tailscale status --json` and `tailscale serve status --json`, which change nothing) and marks it done or to do. **Check again** reads them again and says how many steps are done. A step that is done folds to the line that says so.

1. **Install Tailscale on the phone.** Scan the QR code for your store with the phone's camera: [Google Play](https://play.google.com/store/apps/details?id=com.tailscale.ipn) or the [App Store](https://apps.apple.com/us/app/tailscale/id1470499037). Done once a phone (Android or iOS) shows up on your tailnet.
2. **Install Tailscale on this computer.** The download for its system ([Windows](https://tailscale.com/download/windows), [macOS](https://tailscale.com/download/mac), [Linux](https://tailscale.com/download/linux)), or the install command. Otea never installs anything.
3. **Sign in with the same account on both.** Both join your tailnet. Done when this computer is logged in and a phone is on the same tailnet; if this computer is not logged in, run `tailscale up`.
4. **Turn on HTTPS.** In the admin console's [DNS page](https://console.tailscale.com/admin/dns), turn on MagicDNS if it is off (new tailnets have it on), then under **HTTPS Certificates** choose **Enable HTTPS**. The certificate is public: your machine's name is listed in the Certificate Transparency logs.
5. **Serve Otea over HTTPS.** The step shows the exact command for this computer and port, for example `tailscale serve --bg --https=443 http://127.0.0.1:4400`. It makes Tailscale answer `https://<machine>.<tailnet>.ts.net` with its own certificate and pass the request on to Otea. Only your tailnet sees it (`serve`, never `funnel`), and `--bg` keeps it on after a restart. To undo it, run `tailscale serve --https=443 off`. Copy the command and run it yourself, or press **Run this command**. Otea then asks you to confirm that exact command, and runs it once. This is the only change Otea ever makes to Tailscale. If Tailscale refuses it, the step shows what Tailscale answered. Once it forwards to Otea, Otea uses Tailscale for the phone. If `https://<machine>.<tailnet>.ts.net` already forwards somewhere else (another Otea, another app), the step says where, and how to free it if you no longer use it.
6. **Pair the phone, then turn on notifications.** **Pair a phone** shows a QR code that opens `https://<machine>.<tailnet>.ts.net/pair`. Scan it, then turn on **Preferences › Notifications** on the phone. On iPhone, add Otea to the Home Screen first: Safari allows notifications only for a web app on the Home Screen. Done once a paired device has notifications on. A phone paired through Tailscale with notifications still off marks the step **paired, no notifications** and names what is left: Preferences › Notifications on the phone.

How Otea tells: each paired device keeps how it last reached Otea (through Tailscale's HTTPS, or the local network), written when it pairs and again whenever it is seen. A push subscription counts wherever the device paired, since browsers give push only to a secure page and Tailscale is the only HTTPS Otea has. A device paired on the local network is another origin, so it counts as paired only once it reaches Otea through Tailscale.

Once all six steps are done, the guide folds into a short **Ready** line, with **Show the steps** to open them again. While Tailscale carries the phone, Settings › Phone keeps one note in sight: to use Otea away from this computer, Tailscale must be connected on the phone. When `tailscale status --json` says the phone's peer is offline (its `Online` field; nothing is said when the field is missing or no phone is on the tailnet), the status adds **Your phone is not connected to Tailscale right now**. **Pair a phone** on Tailscale says above the QR code: open Tailscale on the phone and check that it is connected before you scan.

`otea phone tailscale` does the same from the terminal: running it is your confirmation. It stops at the first step that is missing and says what to do:

1. Finds the `tailscale` CLI: on `PATH`, then where the installers put it (`C:\Program Files\Tailscale\tailscale.exe` on Windows, the app or Homebrew on macOS, `/usr/bin` and friends on Linux). When it is missing, it prints how to install it (`winget install --id tailscale.tailscale`, `brew install --cask tailscale`, or Tailscale's install script, and the download page); **Otea never installs anything.**
2. Checks that Tailscale is logged in. When it is not, it says to run `tailscale up` and log in once in the browser; `otea phone tailscale --login` runs `tailscale up` for you.
3. Checks that the tailnet has MagicDNS and HTTPS certificates on (they are on by default on new tailnets); when not, it points at the DNS page of the admin console.
4. Runs `tailscale serve --bg --https=443 http://127.0.0.1:<port>` (the running `otea serve`'s port, or `--port`): Tailscale terminates HTTPS with an automatic certificate and forwards to Otea, for your tailnet only (`serve`, never `funnel`). If `https://<machine>.<tailnet>.ts.net/` already forwards elsewhere, it leaves it alone and says how to free it.
5. Makes Tailscale the phone transport: the pairing QR now carries the HTTPS URL. On the phone: install the Tailscale app, log in with the same account, and scan Otea's QR code.

What `tailscale serve` forwards comes from this computer, so Otea tells it apart by its host (the tailnet name) and its `X-Forwarded-For`, never takes it for this computer's own browser, and still asks for a device token. A forwarded request that no chosen transport expects is refused. The HTTPS certificate is public: the machine's name on the tailnet is listed in the Certificate Transparency logs. `otea phone lan` goes back to the local network (and says how to stop `tailscale serve`); exit 20 (`transport_unavailable`) means Tailscale is not ready yet, or the relay was chosen.

### If it does not open (Si no abre)

Nearly every time, one of three things:

- **Tailscale is off on the phone.** Open the Tailscale app on the phone and check that it says it is connected, then open Otea again. This is the usual one days after setting it up: every step in Settings › Phone stays done, because they are read on this computer. Settings › Phone says when Tailscale reports the phone offline.
- **Otea is not running on this computer**, or the computer is asleep or off.
- **On the local network, the phone is on another Wi‑Fi** (or on mobile data).

The installed app still opens without this computer: the service worker keeps the page and the last data it saw. A computer off the tailnet (asleep, or Tailscale stopped) can leave a request hanging for minutes, so the app waits for it a few seconds at most: about 3 for the page, then it opens the project it last showed from the cache, and about 4 for each read before it shows the last answer it kept. When it cannot reach this computer, whether opened, brought back to the front or opened from a notification, a banner under the top bar asks what to check. Through Tailscale (a `*.ts.net` address) it says: **I can't reach your computer. Is Tailscale connected on this phone? Is Otea open on your computer?** On the local network it asks about the Wi‑Fi instead. When Tailscale answers but nothing listens behind it (a 502: Otea is closed on the computer), it says **Otea is not open on your computer** instead. The banner says when the data was last synced, or that this phone has nothing saved from the project yet. **Retry** reads everything again at once; the app also tries again each time it comes back to the front.

Offline, the app is read-only, except **New**: a capture waits in a queue on the phone and goes as soon as the computer answers (Android sends it in the background too), and the banner says so. An item the phone never opened before has nothing saved: its page says it opens when the computer answers again.

### Notifications

On a phone over HTTPS (Tailscale), **Preferences › Notifications** (Avisos) turns on Web Push: the phone's browser subscribes with the server's VAPID key pair (made on the first `otea serve`, kept in `push-keys.json` in the Otea home with owner-only permissions); a notice names its project and opens it and `otea serve` posts each notice to that browser's push service, encrypted for it (aes128gcm) and to no other host. On iPhone, Safari allows it only for Otea added to the Home Screen; over the local network's plain HTTP no browser allows it, and Preferences says so. The desktop app shows the same notices as the system's notifications (see `desktop/README.md`).

**When a notice does not arrive:**

- **The serve output.** `otea serve` prints each push's outcome, naming the device by its id only, never its endpoint, keys or words. The outcomes are: `sent (201)`; `gone (410), subscription dropped`; `refused by the push service (403): …`, with what the push service said, short and with any address taken out; or `network error: …`.
- **Send a test notification.** The button sits in Preferences › Notifications on the phone, and on each device in **Pair a phone** on the desk (`POST /api/notify/test`, `POST /api/devices/<id>/test-push`). It sends one push to that device right away, past the quiet hours and the spacing, and says what the push service answered: sent, refused with its status, or that the device has no notifications on. "Sent" means the push service took it, not that the phone showed it, so both the phone and the desk add where to look when it does not arrive (on Android, Settings › Apps › Otea › Notifications).
- **Android can block an installed app's notifications on its own**, apart from the browser's permission, and a web page cannot read that switch: while it is off, the permission still reads as granted, the push service still takes each push, and Otea can only say where to look. What Otea does catch:
  - **The permission denied.** Preferences › Notifications reads the permission each time it opens and each time the app comes back to the front, and says **Android blocks this app's notifications: Settings › Apps › Otea › Notifications**, with **Check again**.
  - **A lost subscription.** Blocking notifications in Android and allowing them again leaves the browser without its push subscription, while the server still holds one. As the app opens and each time it comes back to the front, the phone compares the two; when the browser has none, it tells the server, which drops the subscription (`POST /api/notify/unsubscribe`). The desk then shows the device without notifications (and the Tailscale guide's last step is no longer done), and Preferences › Notifications says this phone stopped getting them, beside **Turn on notifications**, which subscribes again with the choices it had.

Each paired phone chooses what it is told, and the server keeps that choice per device and applies it before it sends anything. The desk's device list (**Pair a phone**) shows each device's choice in a line. Each kind is a switch:

| Kind | Default |
| --- | --- |
| Your turn: a review or an approval | on |
| An agent asks you (`otea ask`) | on |
| An agent answered your note | on |
| Something got stuck: an agent went quiet holding its lease | on |
| An agent set something aside for later (`otea release --later`) | off |

So that many agents taking items never become a nonstop stream:

- **Bursts become one notice.** What arrives within a few seconds goes out together, naming its project ("3 things wait for you in tienda-web").
- **Notices are spaced.** After a notice, the next one from that project waits at least two minutes, and everything in between goes out as one.
- **One item never stacks.** An item's news collapses into one notice: a question comes first, then your turn, then the rest. An item is told about at most once every five minutes, and a later notice replaces the earlier one on screen.
- **A bundle opens what it holds.** Android groups Otea's notices, and a tap on the group opens the app without saying which notice. Opening on Your turn, the app looks at the notices still shown: when exactly one is about an item, it opens that item and clears the notice; with several, it stays on Your turn, which lists them.
- **Quiet hours** keep it silent. They are off by default, and nothing is caught up afterwards.
- **Per project.** With several projects, each one can be muted. A notice carries a title, the item's id and title and where tapping it leads (the item, or Your turn for a burst); nothing else from the item. Unpairing a phone unsubscribes it, and a subscription its push service reports gone (404, 410) is dropped. The API: `GET /api/notify`, `POST /api/notify/subscribe` (a paired device on HTTPS), `/api/notify/unsubscribe`, `/api/notify/prefs`, and the desktop app's `GET /api/notify/stream` (this computer only).
