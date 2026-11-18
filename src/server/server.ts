import type { DatabaseSync } from 'node:sqlite';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { agentDetail } from '../app/agent-detail.ts';
import { promptFacts, promptKindOf } from '../app/agent-prompts.ts';
import { syncBoardPresets } from '../app/boards.ts';
import { briefFor } from '../app/brief.ts';
import { listCollectionViews, listShownCollectionViews } from '../app/collections.ts';
import { deviceByToken, touchDevice } from '../app/devices.ts';
import { listEvents } from '../app/events.ts';
import { attachFiles, createItemWithEvidence } from '../app/intake.ts';
import {
  createItem,
  getItem,
  type ListItemsFilter,
  listItems,
  moveItem,
  showItem,
  updateItem,
} from '../app/items.ts';
import { memoryMachine } from '../app/machine.ts';
import { boardRoundOf, liveBoards, rowFactsOf } from '../app/next.ts';
import { editNote, leaveNote, notesSummary, notesView, withdrawNote } from '../app/notes.ts';
import { markOpened, openedFiles } from '../app/opened.ts';
import { performanceOf } from '../app/performance.ts';
import {
  choosePhoneTransport,
  fetchProbe,
  isTransport,
  type Probe,
  phoneSettings,
  phoneStatus,
  RELAY_UNAVAILABLE,
  setLanOpen,
  switchToTailscale,
} from '../app/phone.ts';
import { listAgents, presenceSignature } from '../app/presence.ts';
import { listPresetViews } from '../app/preset-views.ts';
import { estimatesOfItems, pinItems, priorityOf, setOrder } from '../app/priority.ts';
import { type Env, type Project, projectView } from '../app/project.ts';
import { answerQuestion } from '../app/questions.ts';
import { linkItems, unlinkItems } from '../app/relations.ts';
import { reassignItem, restartItem, undoRelease } from '../app/restart.ts';
import { NO_TAILSCALE, type TailscaleCli } from '../app/tailscale.ts';
import {
  closeTopic,
  convertTopic,
  dismissTopicSuggestion,
  linkTopic,
  listTopics,
  noteTopic,
  requireTopic,
  setTopicsOn,
  topicSuggestions,
  topicsOfItem,
  topicsOn,
} from '../app/topics.ts';
import { undoMove } from '../app/undo.ts';
import { agentPrompt, isPromptKind, PROMPT_KINDS } from '../core/agent-prompts.ts';
import { PERIOD_HINT, parsePeriod } from '../core/board/performance.ts';
import { OteaError } from '../core/errors.ts';
import { MAX_EVIDENCE_MB } from '../core/evidence.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { type EventFilter, itemOfClientKey, selectStateEntries } from '../store/queries.ts';
import { boardsApi } from './boards.ts';
import { type ChangeFeed, createChangeFeed } from './changes.ts';
import {
  errorBody,
  ForbiddenHost,
  InvalidQuery,
  RejectedRequest,
  toErrorResponse,
} from './errors.ts';
import { serveEvidence } from './evidence.ts';
import { DEFAULT_PORT, isAllowedHost, isApiPath } from './hosts.ts';
import { openProjects, type ProjectSource } from './hub.ts';
import { AttemptLimiter, type Clock, isLoopback, PairingCodes, plainAddress } from './lan.ts';
import { type LanAccess, type LanNetwork, lanAccess, openLan } from './lan-access.ts';
import { createNotifier, type Notifier } from './notifier.ts';
import { notifyApi } from './notify-api.ts';
import {
  assertCanManageDevices,
  assertPhoneOn,
  type Phone,
  pair,
  pairingView,
  peekPairing,
  revoke,
} from './pairing.ts';
import { addPath, forgetPath, projectOverviews, projectSettings, relinkPath } from './projects.ts';
import { generateVapidKeys, type PushSender, type VapidKeys, webPushSender } from './push.ts';
import {
  type Client,
  deviceCookie,
  LOCAL,
  mountAuth,
  type OteaEnv,
  type Port,
  type Session,
  session,
} from './session.ts';
import { type LiveStreams, liveStreams } from './stream.ts';
import { type Arrival, type PhoneTransport, proxied, tailscaleTransport } from './transports.ts';
import { BUILT_UI_DIR, mountUi } from './ui.ts';
import {
  answerRequest,
  assertConfigurable,
  assertSameOrigin,
  assertSignedIn,
  assertWritable,
  attachRequest,
  briefRequest,
  clientKeyOf,
  createRequest,
  HUMAN_IN_UI,
  linkRequest,
  MAX_CREATE_BYTES,
  MAX_INTAKE_FILES,
  moveRequest,
  noteRequest,
  openedRequest,
  orderRequest,
  pathRequest,
  pinRequest,
  reassignRequest,
  relinkRequest,
  undoRequest,
  updateRequest,
} from './writes.ts';
import { wantsPage, wrongAddressPage } from './wrong-address.ts';

export type OteaServer = {
  app: Hono<OteaEnv>;
  // What the server keeps for the machine rather than for a project (app/machine.ts).
  machine: DatabaseSync;
  // The notifier of a project served, once it is open.
  notifierOf(id: string): Notifier | undefined;
  // Opens every project served now, so each one's notices go out from the start.
  sync(): void;
  // Phone access: the pairing code and the doors a phone comes through (opening the local network
  // opens its own; choosing Tailscale opens its own).
  phone: Phone;
  // The local network's door, opened and closed while the server runs (Settings › Phone, otea
  // phone lan --open, otea serve --lan).
  lan: LanAccess;
  listeningOn(port: number): void;
  close(): void;
};

export type ServerOptions = {
  pollIntervalMs?: number;
  uiDir?: string;
  token?: string;
  // LAN access open from the start, for a caller that listens on every interface itself: the
  // addresses of this computer a paired device may reach it at, and the names (its mDNS
  // `<hostname>.local`) that resolve to one of them.
  lan?: { addresses: string[]; names?: string[] };
  // How the local network opens while the server runs (otea serve gives the real one; tests give a
  // fake). Without it, and without `lan`, the local network cannot open.
  network?: LanNetwork;
  now?: Clock;
  // Where the registry of the projects is found (OTEA_HOME).
  env?: Env;
  // The machine store (app/machine.ts); a fresh one in memory when none is given.
  machine?: DatabaseSync;
  // This computer's name, as a phone that pairs reads it.
  computer?: string;
  // The tailscale CLI Configuración's Tailscale option runs, and how a phone URL is tried; the
  // real ones only where otea serve runs (tests give fakes).
  tailscale?: TailscaleCli;
  probe?: Probe;
  // Notifications: the server's VAPID keys (otea serve keeps them in the Otea home; a test gets
  // fresh ones), how a push is sent (the real web push, or a fake), and how often the items are looked
  // at again for what a clock alone changes (a lease running out).
  notify?: {
    keys?: VapidKeys;
    sender?: PushSender;
    tickMs?: number;
    minuteOfDay?: (ms: number) => number;
  };
};

function isTurn(value: string): value is Turn {
  return (TURNS as readonly string[]).includes(value);
}

// `field=key=value`, repeatable, keeps the items whose field holds exactly that value.
function fieldsFilter(pairs: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator < 1) throw new InvalidQuery(`field expects key=value, got "${pair}"`);
    const key = pair.slice(0, separator);
    if (key in fields) throw new InvalidQuery(`field "${key}" given twice`);
    fields[key] = pair.slice(separator + 1);
  }
  return fields;
}

function itemsFilter(query: Record<string, string>, fields: string[] = []): ListItemsFilter {
  const { collection, state, type, turn, parent } = query;
  const filter: ListItemsFilter = {};
  if (collection !== undefined) filter.collection = collection;
  if (parent !== undefined) filter.parent = parent;
  if (state !== undefined) filter.state = state;
  if (type !== undefined) filter.type = type;
  if (turn !== undefined) {
    if (!isTurn(turn)) throw new InvalidQuery(`turn must be one of ${TURNS.join(', ')}`);
    filter.turn = turn;
  }
  if (fields.length > 0) filter.fields = fieldsFilter(fields);
  return filter;
}

// A cursor (`since`, from 0) or a count (`limit`, `latest`, from 1), as a whole number.
function wholeNumber(name: string, text: string | undefined, min: number): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(value) || value < min) {
    throw new InvalidQuery(`${name} must be a whole number of at least ${min}`);
  }
  return value;
}

// The same filter `otea events` reads, plus `latest`: the newest events, where a live feed starts.
function eventsFilter(query: Record<string, string>): EventFilter {
  const { item, collection } = query;
  const since = wholeNumber('since', query.since, 0);
  const limit = wholeNumber('limit', query.limit, 1);
  const latest = wholeNumber('latest', query.latest, 1);
  if (limit !== undefined && latest !== undefined) {
    throw new InvalidQuery('limit and latest cannot be combined');
  }
  return {
    ...(item === undefined ? {} : { item }),
    ...(collection === undefined ? {} : { collection }),
    ...(since === undefined ? {} : { since }),
    ...(limit === undefined ? {} : { limit }),
    ...(latest === undefined ? {} : { latest }),
  };
}

function tooLarge(): never {
  throw new RejectedRequest(
    413,
    'evidence_too_large',
    `Send at most ${MAX_INTAKE_FILES} files of ${MAX_EVIDENCE_MB} MB each`,
  );
}

// What every project's API shares: the machine's doors, devices and settings.
type Doors = {
  lan: LanAccess;
  machine: DatabaseSync;
  source: ProjectSource;
  // A device paired or was revoked: every project's page and notifier hears of it.
  changed(): void;
  keys: VapidKeys;
  auth: Session;
  phone: Phone;
  port: Port;
  env: Env;
  tailscale: TailscaleCli;
  probe: Probe;
};

const TransportBody = z.object({ transport: z.string() });
const TopicsSwitchBody = z.object({ on: z.boolean() });
const TopicNoteBody = z.object({ text: z.string() });
const TopicConvertBody = z.object({ item: z.string().min(1) });

// A body the topic routes read, or a 400 saying what they expect.
async function topicBody<T>(c: Context, schema: z.ZodType<T>, expected: string): Promise<T> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) throw new RejectedRequest(400, 'invalid_body', `Expected ${expected}`);
  return parsed.data;
}

// What is the computer's rather than a project's: the session, the pairing code and the paired
// devices, and how a phone reaches the server. Answered at /api and in every project's API alike.
function machineApi(doors: Doors): Hono<OteaEnv> {
  const { auth, phone, port, machine } = doors;
  return (
    new Hono<OteaEnv>()
      .get('/session', (c) =>
        c.json({
          canWrite: auth.canWrite(c),
          canManageDevices: auth.canManageDevices(c),
          canConfigure: auth.canConfigure(c),
        }),
      )
      .get('/lan', (c) => {
        assertCanManageDevices(c, auth);
        return c.json(pairingView(machine, phone, port(), c.req.query('address')));
      })
      .post('/lan/code', (c) => {
        assertCanManageDevices(c, auth);
        assertSameOrigin(c);
        assertPhoneOn(phone).codes.issue();
        return c.json(pairingView(machine, phone, port(), c.req.query('address')), 201);
      })
      // How a phone reaches the desk: the chosen transport, its URL and whether it answers there.
      .get('/phone', async (c) => {
        assertCanManageDevices(c, auth);
        return c.json(await phoneView(doors));
      })
      // Opens the local network to phones without a restart, and keeps it open for the next otea
      // serve; closing it stops listening there. Paired devices stay paired either way.
      .post('/lan/open', async (c) => {
        assertConfigurable(c, auth);
        await doors.lan.open();
        setLanOpen(machine, true);
        if (phone.chosen()) phone.codes.issue();
        return c.json(await phoneView(doors));
      })
      .post('/lan/close', async (c) => {
        assertConfigurable(c, auth);
        setLanOpen(machine, false);
        await doors.lan.close();
        return c.json(await phoneView(doors));
      })
      // Chooses the transport. Tailscale is set up first (tailscale serve points at this port) and
      // kept only once it is ready; the Otea relay is not available yet.
      .post('/phone', async (c) => {
        assertConfigurable(c, auth);
        const parsed = TransportBody.safeParse(await c.req.json().catch(() => undefined));
        const transport = parsed.success ? parsed.data.transport : '';
        if (!isTransport(transport)) {
          throw new RejectedRequest(
            400,
            'invalid_body',
            'Expected {"transport": "lan" | "tailscale"}',
          );
        }
        if (transport === 'relay') {
          throw new RejectedRequest(409, 'transport_unavailable', RELAY_UNAVAILABLE);
        }
        const check =
          transport === 'tailscale'
            ? await switchToTailscale(machine, doors.tailscale, port())
            : null;
        if (transport === 'lan') choosePhoneTransport(machine, { transport, tailscaleHost: null });
        if (phone.chosen()) phone.codes.issue();
        const status = await phoneView(doors);
        return c.json({ ...status, ...(check ? { tailscale: check } : {}) });
      })
      .post('/devices/:id/revoke', (c) => {
        assertCanManageDevices(c, auth);
        assertSameOrigin(c);
        // Its push subscription goes with it.
        const device = revoke(machine, c.req.param('id'));
        doors.changed();
        return c.json(device);
      })
  );
}

function api(project: Project, { feed, streams, notifier }: Live, doors: Doors): Hono<OteaEnv> {
  const { auth, env, machine } = doors;
  return (
    new Hono<OteaEnv>()
      // A board published from another process (the CLI, another server) joins the catalog before
      // anything reads items; it costs one query when nothing was published.
      .use(async (_c, next) => {
        syncBoardPresets(project);
        await next();
      })
      .route('/', machineApi(doors))
      .get('/project', (c) => c.json(projectView(project)))
      .get('/projects', (c) => c.json(projectOverviews(doors.source.list(), project.identity.id)))
      .get('/project/settings', (c) => c.json(projectSettings(project, env)))
      .post('/project/paths', async (c) => {
        assertConfigurable(c, auth);
        const { path } = await pathRequest(c);
        return c.json(addPath(project, path, env), 201);
      })
      .post('/project/paths/relink', async (c) => {
        assertConfigurable(c, auth);
        const { from, to, force } = await relinkRequest(c);
        return c.json(relinkPath(project, from, to, force, env));
      })
      .post('/project/paths/forget', async (c) => {
        assertConfigurable(c, auth);
        const { path } = await pathRequest(c);
        return c.json(forgetPath(project, path, env));
      })
      .get('/collections', (c) => c.json(listShownCollectionViews(project)))
      .get('/presets', (c) => c.json(listPresetViews(project)))
      .get('/agents', (c) => c.json({ agents: listAgents(project.db) }))
      // What to paste into an agent's chat (Conectar un agente, the empty project): the first contact,
      // one more agent joining, or one more board; without a kind, the project's moment.
      .get('/agent-prompt', (c) => {
        const { kind, lang: asked } = c.req.query();
        if (kind !== undefined && !isPromptKind(kind))
          throw new InvalidQuery(`kind must be one of ${PROMPT_KINDS.join(', ')}`);
        const lang = asked === 'es' ? 'es' : 'en';
        const moment = kind ?? promptKindOf(project);
        const facts = promptFacts(project, moment);
        const first = 'first' in facts && facts.first === true ? { first: true } : {};
        return c.json({ kind: moment, prompt: agentPrompt(moment, lang, facts), ...first });
      })
      // How each model performs (Rendimiento): per model family and effort, for a board and a period.
      .get('/performance', (c) => {
        const { board, since = 'all' } = c.req.query();
        if (!parsePeriod(since, new Date().toISOString())) {
          throw new InvalidQuery(`since takes ${PERIOD_HINT}`);
        }
        return c.json(performanceOf(project, { board, since }));
      })
      .get('/agents/:name', (c) => c.json(agentDetail(project, c.req.param('name'))))
      .get('/items', (c) => {
        const items = listItems(project, itemsFilter(c.req.query(), c.req.queries('field')));
        // On a board, each item's round as the engine counts it, so every list agrees with it.
        const boards = liveBoards(project);
        const priority = priorityOf(project.db);
        // When each item entered its state: the turn it stands on began then (Te toca counts from it).
        const entered = selectStateEntries(project.db);
        const estimated = estimatesOfItems(
          project,
          items,
          (collection) => boards.find((board) => board.collection === collection)?.def,
        );
        return c.json(
          items.map((item) => {
            const round = boardRoundOf(project, item, boards);
            // The notes of its round: how many, how many wait, and what the agent answered last.
            const notes = notesSummary(project, item, boards);
            // The person's order (app/priority.ts) and the role values an agent estimated.
            const order = priority.get(item.id);
            const estimates = estimated.get(item.id) ?? {};
            // A closed board item: who did it, and whether its branch was merged.
            const row = rowFactsOf(project, item, boards);
            const enteredAt = entered.get(item.id);
            return {
              ...item,
              ...row,
              ...(enteredAt === undefined ? {} : { enteredAt }),
              ...(round === undefined ? {} : { round }),
              ...(notes === undefined ? {} : { notes }),
              ...(order === undefined || Object.keys(order).length === 0
                ? {}
                : { priority: order }),
              ...(Object.keys(estimates).length === 0 ? {} : { estimates }),
            };
          }),
        );
      })
      .post('/order', async (c) => {
        assertWritable(c, auth);
        const { collection, ids } = await orderRequest(c);
        setOrder(project, { collection, ids, ...HUMAN_IN_UI });
        feed.notify();
        return c.json({ ok: true });
      })
      .post('/pin', async (c) => {
        assertWritable(c, auth);
        const { ids, pinned } = await pinRequest(c);
        pinItems(project, { ids, pinned, ...HUMAN_IN_UI });
        feed.notify();
        return c.json({ ok: true });
      })
      .post('/items', bodyLimit({ maxSize: MAX_CREATE_BYTES, onError: tooLarge }), async (c) => {
        assertWritable(c, auth, true);
        const clientKey = clientKeyOf(c);
        const { files, ...request } = await createRequest(c);
        // Sent again (a phone that never heard back): the item the first send made, not a second.
        const made = clientKey === undefined ? undefined : itemOfClientKey(project.db, clientKey);
        if (made !== undefined) {
          const { events: _events, ...item } = getItem(project, made);
          c.header('idempotent-replayed', 'true');
          return c.json(item, 200);
        }
        const input = {
          ...request,
          ...HUMAN_IN_UI,
          ...(clientKey === undefined ? {} : { clientKey }),
        };
        const item =
          files.length === 0
            ? createItem(project, input)
            : createItemWithEvidence(project, input, files);
        feed.notify();
        return c.json(item, 201);
      })
      // Files the person adds to an item that exists, from its page.
      .post(
        '/items/:id/evidence',
        bodyLimit({ maxSize: MAX_CREATE_BYTES, onError: tooLarge }),
        async (c) => {
          assertWritable(c, auth, true);
          const files = await attachRequest(c);
          const evidence = attachFiles(project, { id: c.req.param('id'), ...HUMAN_IN_UI }, files);
          feed.notify();
          return c.json(evidence, 201);
        },
      )
      .get('/items/:id', (c) => {
        const id = c.req.param('id');
        let item: ReturnType<typeof showItem>;
        try {
          item = showItem(project, id, HUMAN_IN_UI);
        } catch (error) {
          // The page asks for null rather than a 404 when there is no such item (it says so
          // itself), so a mistyped link leaves no error in the browser's console.
          const missing = error instanceof OteaError && error.details?.kind === 'item_missing';
          if (missing && c.req.query('missing') === 'null') return c.json(null);
          throw error;
        }
        if (!item.archived) return c.json(item);
        // An archived board's collection is in no list: the page reads the item's words from here.
        const collection = listCollectionViews(project, { archived: true }).find(
          ({ name }) => name === item.collection,
        );
        return c.json({ ...item, archived: { ...item.archived, collection } });
      })
      .post('/items/:id/move', async (c) => {
        assertWritable(c, auth);
        const request = await moveRequest(c);
        const item = moveItem(project, { id: c.req.param('id'), ...request, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      // Notes from the person to the agent doing the item's step: the thread (all of it, or a step
      // and round), and a new note, from the phone too; neither moves the item.
      .get('/items/:id/notes', (c) => {
        const { step } = c.req.query();
        const round = wholeNumber('round', c.req.query('round'), 1);
        const filter = {
          ...(step === undefined ? {} : { step }),
          ...(round === undefined ? {} : { round }),
        };
        return c.json(notesView(project, c.req.param('id'), filter));
      })
      .post('/items/:id/notes', async (c) => {
        assertWritable(c, auth);
        const request = await noteRequest(c);
        const id = c.req.param('id');
        leaveNote(project, { id, ...request, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(notesView(project, id), 201);
      })
      // A review comment changed or taken back while the review is open (app/notes.ts).
      .post('/items/:id/notes/:note/edit', async (c) => {
        assertWritable(c, auth);
        const { text } = await answerRequest(c);
        const id = c.req.param('id');
        const note = wholeNumber('note', c.req.param('note'), 1) ?? 0;
        editNote(project, { id, note, text, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(notesView(project, id));
      })
      .post('/items/:id/notes/:note/withdraw', (c) => {
        assertWritable(c, auth);
        const id = c.req.param('id');
        const note = wholeNumber('note', c.req.param('note'), 1) ?? 0;
        withdrawNote(project, { id, note, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(notesView(project, id));
      })
      // The files the person opened in the reader (app/opened.ts), on the desk or the phone: what
      // Aprobar counts as left unopened, the same on every device. No event, no feed change.
      .get('/items/:id/opened', (c) =>
        c.json({ evidence: openedFiles(project, c.req.param('id')) }),
      )
      .post('/items/:id/opened', async (c) => {
        assertWritable(c, auth);
        const { evidence } = await openedRequest(c);
        const id = c.req.param('id');
        markOpened(project, { id, evidence, ...HUMAN_IN_UI });
        return c.json({ evidence: openedFiles(project, id) });
      })
      // Side topics (app/topics.ts): the list, one topic, a note that keeps it going, closing it and
      // turning it into a task, from the phone too; turning them on or off is the desk's.
      .get('/topics', (c) =>
        c.json({
          on: topicsOn(project),
          topics: listTopics(project, {
            all: c.req.query('all') === '1',
            search: c.req.query('search') ?? '',
          }),
        }),
      )
      .post('/topics/switch', async (c) => {
        assertConfigurable(c, auth);
        const { on } = await topicBody(c, TopicsSwitchBody, '{"on": boolean}');
        setTopicsOn(project, on);
        feed.notify();
        return c.json({ on: topicsOn(project), topics: listTopics(project) });
      })
      .get('/topics/:id', (c) => c.json(requireTopic(project, c.req.param('id'))))
      .post('/topics/:id/notes', async (c) => {
        assertWritable(c, auth);
        const { text } = await topicBody(c, TopicNoteBody, '{"text": string}');
        if (text.trim() === '')
          throw new RejectedRequest(400, 'invalid_body', 'Expected a note with some text');
        const topic = noteTopic(project, { id: c.req.param('id'), text, actor: HUMAN_IN_UI.actor });
        feed.notify();
        return c.json(topic, 201);
      })
      .post('/topics/:id/close', (c) => {
        assertWritable(c, auth);
        const topic = closeTopic(project, { id: c.req.param('id'), actor: HUMAN_IN_UI.actor });
        feed.notify();
        return c.json(topic);
      })
      .post('/topics/:id/convert', async (c) => {
        assertWritable(c, auth);
        const { item } = await topicBody(c, TopicConvertBody, '{"item": string}');
        const topic = convertTopic(project, {
          id: c.req.param('id'),
          item,
          actor: HUMAN_IN_UI.actor,
        });
        feed.notify();
        return c.json(topic);
      })
      // An item's topics: those linked to it, and those it may have come from, for the person to
      // confirm or dismiss.
      .get('/items/:id/topics', (c) => {
        const id = c.req.param('id');
        return c.json({
          linked: topicsOfItem(project, id),
          suggested: topicSuggestions(project, id),
        });
      })
      .post('/items/:id/topics/:topic/confirm', (c) => {
        assertWritable(c, auth);
        linkTopic(project, { id: c.req.param('topic'), item: c.req.param('id'), via: 'confirmed' });
        feed.notify();
        return c.json({ ok: true });
      })
      .post('/items/:id/topics/:topic/dismiss', (c) => {
        assertWritable(c, auth);
        dismissTopicSuggestion(project, { id: c.req.param('topic'), item: c.req.param('id') });
        feed.notify();
        return c.json({ ok: true });
      })
      // The person's answer to an agent's question, from the phone too: the turn goes back to the
      // agent, in the same round.
      .post('/items/:id/answer', async (c) => {
        assertWritable(c, auth);
        const { text } = await answerRequest(c);
        const id = c.req.param('id');
        answerQuestion(project, { id, text, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(showItem(project, id, HUMAN_IN_UI));
      })
      .post('/items/:id/update', async (c) => {
        assertWritable(c, auth);
        const { fields } = await updateRequest(c);
        const item = updateItem(project, {
          id: c.req.param('id'),
          fields,
          actor: HUMAN_IN_UI.actor,
        });
        feed.notify();
        return c.json(item);
      })
      .post('/items/:id/undo', async (c) => {
        assertWritable(c, auth);
        const undo = await undoRequest(c);
        const id = c.req.param('id');
        const item =
          'from' in undo
            ? undoMove(project, { id, from: undo.from, ...HUMAN_IN_UI })
            : undoRelease(project, { id, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      // A stuck item: back in the queue of its step (Retomar), or left for an agent (Reasignar).
      .post('/items/:id/restart', (c) => {
        assertWritable(c, auth);
        const item = restartItem(project, { id: c.req.param('id'), ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      .post('/items/:id/reassign', async (c) => {
        assertWritable(c, auth);
        const { agent } = await reassignRequest(c);
        const item = reassignItem(project, { id: c.req.param('id'), agent, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      .post('/items/:id/link', async (c) => {
        assertWritable(c, auth);
        const request = await linkRequest(c);
        const relation = linkItems(project, { id: c.req.param('id'), ...request, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(relation, 201);
      })
      .post('/items/:id/unlink', async (c) => {
        assertWritable(c, auth);
        const request = await linkRequest(c);
        const relation = unlinkItems(project, {
          id: c.req.param('id'),
          ...request,
          ...HUMAN_IN_UI,
        });
        feed.notify();
        return c.json(relation);
      })
      .post('/brief', async (c) => c.json(briefFor(project, await briefRequest(c))))
      .get('/evidence/:id/file', (c) => {
        assertSignedIn(c, auth, 'open evidence files');
        return serveEvidence(c, project, c.req.param('id'));
      })
      .route('/', boardsApi(project, feed, auth))
      .route('/', notifyApi(machine, notifier, doors.keys, auth))
      .get('/events', (c) => c.json(listEvents(project, eventsFilter(c.req.query()))))
      .get('/stream', (c) => streams.handle(c))
      .all('*', (c) => c.json(errorBody('not_found', `No route ${c.req.path}`), 404))
  );
}

// What an unpaired device on the LAN may reach: the pairing screen, the files it loads, and the
// two pairing calls. Everything else waits for a device token.
function isPairingPath(c: Context): boolean {
  const { method, path } = c.req;
  if (method === 'POST') return path === '/api/pair' || path === '/api/pair/peek';
  if (method !== 'GET' && method !== 'HEAD') return false;
  // The home-screen manifest and icons too: a phone adds Otea to its home screen before it pairs.
  // The service worker is a static file like them; it caches nothing a request was refused.
  return (
    path === '/pair' ||
    path === '/manifest.webmanifest' ||
    path === '/sw.js' ||
    path.startsWith('/assets/') ||
    path.startsWith('/icons/') ||
    /^\/otea-[a-z-]+\.svg$/.test(path)
  );
}

function statusSources(doors: Doors) {
  const port = doors.port();
  return {
    port,
    lanUrls: doors.phone.lan?.urls(port) ?? [],
    tailscale: doors.tailscale,
    probe: doors.probe,
  };
}

// The transport's status, whether the local network is open now, and whether opening it may make
// Windows ask for a firewall permission (Otea never changes the firewall itself).
async function phoneView(doors: Doors) {
  const status = await phoneStatus(doors.machine, statusSources(doors));
  return { ...status, lanOpen: doors.lan.isOpen(), firewallPrompt: process.platform === 'win32' };
}

function remoteAddress(c: Context): string | undefined {
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  const address = incoming?.socket?.remoteAddress;
  return address === undefined ? undefined : plainAddress(address);
}

// Last seen is written at most once a minute per device, not on every request.
const SEEN_EVERY_MS = 60 * 1000;

// A project's own live parts: its change feed, the pages' live streams and its notifier.
type Live = { feed: ChangeFeed; streams: LiveStreams; notifier: Notifier };

type Host = Live & { app: Hono<OteaEnv> };

// The project a page is on: `/p/<id>/…`.
const PROJECT_PATH = /^\/p\/([^/]+)(\/.*)?$/;

// Browsers cap a cookie's lifetime at 400 days.
const LAST_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

// The project a browser last had open on this server, so `/` (the home-screen shortcut, a plain
// `otea serve`) opens it again. Named after the port, as the session is.
const lastCookie = (port: number) => `otea_project_${port}`;

function isProject(served: Project | ProjectSource): served is Project {
  return 'db' in served;
}

export function createServer(
  served: Project | ProjectSource,
  options: ServerOptions = {},
): OteaServer {
  const source = isProject(served) ? openProjects(served) : served;
  const machine = options.machine ?? memoryMachine();
  const ownMachine = options.machine === undefined;
  const now = options.now ?? Date.now;
  let port = DEFAULT_PORT;
  const app = new Hono<OteaEnv>();
  const lan = options.lan
    ? openLan({ addresses: options.lan.addresses, names: options.lan.names ?? [] })
    : lanAccess(app.fetch, () => port, options.network);
  const tailscaleDoor = (): PhoneTransport | undefined => {
    const { transport, tailscaleHost } = phoneSettings(machine);
    return transport === 'tailscale' && tailscaleHost
      ? tailscaleTransport(tailscaleHost)
      : undefined;
  };
  const phone: Phone = {
    get lan() {
      return lan.transport();
    },
    codes: new PairingCodes(now),
    attempts: new AttemptLimiter(now),
    settings: () => phoneSettings(machine),
    doors: () => [tailscaleDoor(), lan.transport()].filter((door) => door !== undefined),
    chosen: () =>
      phoneSettings(machine).transport === 'tailscale' ? tailscaleDoor() : lan.transport(),
  };
  // A request one of the open phone doors admits is a device's: from the local network, a private
  // address naming one of this computer's addresses or its own .local name (any other DNS name is
  // how a rebinding page gets in); through Tailscale, what tailscale serve forwards. It carries a
  // device token or reaches only the pairing screen. Any other request must come from this computer
  // and name localhost; one a proxy forwarded (X-Forwarded-For) is never this computer's own.
  const identify = (c: Context): Client => {
    const host = c.req.header('host');
    const remote = remoteAddress(c);
    const arrival: Arrival = { host, remote, forwardedFor: c.req.header('x-forwarded-for') };
    const admission = phone
      .doors()
      .map((door) => door.admit(arrival, port))
      .find((admitted) => admitted !== undefined);
    if (!admission) {
      const here = remote === undefined || isLoopback(remote);
      if (!here || proxied(arrival) || !isAllowedHost(host, port)) {
        throw new ForbiddenHost(`Host "${host ?? ''}" is not allowed`);
      }
      return { kind: 'local' };
    }
    const { address, secure } = admission;
    const device = deviceByToken(machine, getCookie(c, deviceCookie(port)) ?? '');
    if (!device) return { kind: 'unpaired', address, secure };
    const seen = device.lastSeenAt === null ? 0 : Date.parse(device.lastSeenAt);
    if (now() - seen >= SEEN_EVERY_MS) touchDevice(machine, device.id, new Date(now()));
    return { kind: 'device', device, address, secure };
  };
  // Each project's API runs as its own app; the client the root identified travels with the request.
  const clients = new WeakMap<Request, Client>();
  app.use(async (c, next) => {
    const client = identify(c);
    c.set('client', client);
    clients.set(c.req.raw, client);
    if (client.kind === 'unpaired' && !isPairingPath(c)) {
      if (c.req.method === 'GET' && !isApiPath(c.req.path)) return c.redirect('/pair', 302);
      throw new RejectedRequest(
        401,
        'unpaired',
        'This device is not paired; scan the pairing code shown on the desk',
      );
    }
    await next();
  });
  const boundPort = () => port;
  mountAuth(app, options.token, boundPort);
  const keys = options.notify?.keys ?? generateVapidKeys();
  const sender = options.notify?.sender ?? webPushSender(keys);
  const hosts = new Map<string, Host>();
  const auth = session(options.token, boundPort);
  const computer = options.computer ?? 'Otea';
  const onError = (error: Error, c: Context) => {
    if (error instanceof ForbiddenHost && wantsPage(c)) {
      return c.html(wrongAddressPage(c.req.header('accept-language')), 403);
    }
    const { status, body } = toErrorResponse(error);
    return c.json(body, status);
  };
  const doors: Doors = {
    lan,
    machine,
    source,
    changed() {
      for (const host of hosts.values()) {
        host.notifier.refresh();
        host.feed.notify();
      }
    },
    keys,
    auth,
    phone,
    port: boundPort,
    env: options.env ?? process.env,
    tailscale: options.tailscale ?? NO_TAILSCALE,
    probe: options.probe ?? fetchProbe,
  };

  const open = (project: Project): Host => {
    const { id } = project.identity;
    const feed = createChangeFeed(project.db, options.pollIntervalMs);
    const streams = liveStreams(feed, () => presenceSignature(project.db));
    const notifier = createNotifier(project, feed, {
      sender,
      targets: machine,
      now,
      ...(options.notify?.tickMs === undefined ? {} : { tickMs: options.notify.tickMs }),
      ...(options.notify?.minuteOfDay === undefined
        ? {}
        : { minuteOfDay: options.notify.minuteOfDay }),
    });
    // Devices subscribed before this start are told from now on.
    notifier.refresh();
    const live = { feed, streams, notifier };
    const projectApp = new Hono<OteaEnv>().basePath(`/p/${id}`);
    projectApp.use(async (c, next) => {
      c.set('client', clients.get(c.req.raw) ?? LOCAL);
      await next();
      // Whose answer it is, for the installed app's cache and its queue (ui/src/offline).
      c.header('x-otea-project', id);
    });
    // A write made for another project (a capture queued on the phone): never applied to this one.
    projectApp.use('/api/*', async (c, next) => {
      const meant = c.req.header('x-otea-project');
      if (c.req.method !== 'GET' && meant && meant !== id)
        throw new RejectedRequest(
          409,
          'other_project',
          'This was made for another project, not the one at this address',
        );
      await next();
    });
    projectApp.route('/api', api(project, live, doors));
    projectApp.onError(onError);
    const host = { ...live, app: projectApp };
    hosts.set(id, host);
    return host;
  };

  const hostOf = (id: string): Host | undefined => {
    const held = hosts.get(id);
    if (held) return held;
    const project = source.get(id);
    return project ? open(project) : undefined;
  };

  const sync = () => {
    for (const each of source.list()) if (each.project) hostOf(each.id);
  };

  // The pairing screen's two calls: a device pairs with the computer, not with one project.
  app.post('/api/pair/peek', async (c) => c.json(await peekPairing(c, computer, phone)));
  app.post('/api/pair', async (c) => {
    const paired = await pair(c, machine, computer, phone, boundPort);
    doors.changed();
    return c.json(paired, 201);
  });
  app.route('/api', machineApi(doors));
  app.all('/api/*', (c) =>
    c.json(
      errorBody('not_found', `No route ${c.req.path}; a project's API is at /p/<id>/api`),
      404,
    ),
  );

  // `/`: the project this browser had open last, else the first one served.
  app.get('/', (c) => {
    const last = getCookie(c, lastCookie(port));
    const listed = source.list().filter((each) => each.project);
    const target = listed.find((each) => each.id === last) ?? listed[0];
    if (!target) return c.text(NO_PROJECTS, 404);
    return c.redirect(`/p/${target.id}/`, 302);
  });

  app.all('/p/*', async (c, next) => {
    const match = PROJECT_PATH.exec(c.req.path);
    const id = match?.[1] ?? '';
    const rest = match?.[2] ?? '';
    const host = hostOf(id);
    if (isApiPath(rest)) {
      if (!host) {
        throw new RejectedRequest(404, 'no_project', `This server serves no project ${id}`);
      }
      return host.app.fetch(c.req.raw, c.env);
    }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
    // A project no longer served (forgotten, its data gone): the home opens another.
    if (!host) return c.redirect('/', 302);
    if (rest === '') return c.redirect(`/p/${id}/`, 301);
    setCookie(c, lastCookie(port), id, {
      path: '/',
      sameSite: 'Lax',
      maxAge: LAST_COOKIE_MAX_AGE,
    });
    await next();
  });
  mountUi(app, options.uiDir ?? BUILT_UI_DIR);
  app.onError(onError);
  sync();
  let closed = false;
  return {
    app,
    machine,
    phone,
    lan,
    notifierOf: (id) => hosts.get(id)?.notifier,
    sync,
    listeningOn(listened) {
      port = listened;
    },
    close() {
      if (closed) return;
      closed = true;
      void lan.close();
      for (const host of hosts.values()) {
        host.notifier.close();
        host.streams.closeAll();
        host.feed.close();
      }
      hosts.clear();
      source.close();
      if (ownMachine) machine.close();
    },
  };
}

const NO_PROJECTS =
  'This Otea server serves no project yet. Run "otea init" in a project folder, then "otea open" there.';
