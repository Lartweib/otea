import type { DatabaseSync } from 'node:sqlite';
import type { AgentChannel } from '../core/authority.ts';
import { OteaError } from '../core/errors.ts';
import { assertProfileValue, type Profile, profileLine } from '../core/profile.ts';
import { transaction } from '../store/database.ts';
import {
  findAgent,
  findProfile,
  type ProfileView,
  profileView,
  saveProfile,
} from '../store/queries.ts';
import { type Clock, systemClock } from './items.ts';
import { CLI_HARNESS, type Harness } from './presence.ts';

// Every agent declares the profile it runs as (harness, model, effort) and keeps it current. It is
// stored on every event the agent writes, for analysis after the fact; it never routes or
// restricts work. A new session leaves it unconfirmed until the agent declares it again.

export type ProfileInput = {
  agent: string;
  channel: AgentChannel;
  // What the agent came through: an MCP client's clientInfo names the harness for it.
  harness?: Harness | undefined;
  model: string;
  effort: string;
  // The harness a command-line agent names (an MCP client's own name wins over it).
  given?: string | undefined;
};

export type DeclaredProfileView = {
  agent: string;
  profile: ProfileView;
  confirmed: boolean;
  changed: boolean;
};

const named = (harness: Harness | undefined) =>
  harness && harness.name !== CLI_HARNESS.name ? harness.name : undefined;

// The harness of a declaration: the MCP client's, else the one named, else the one known.
function harnessOf(db: DatabaseSync, input: ProfileInput): string | undefined {
  if (input.channel === 'mcp' && named(input.harness)) return named(input.harness);
  if (input.given !== undefined) return input.given;
  const known = findProfile(db, input.agent)?.profile.harness;
  if (known) return known;
  const seen = findAgent(db, input.agent)?.harness;
  return seen && seen !== CLI_HARNESS.name ? seen : undefined;
}

export function declareProfile(
  db: DatabaseSync,
  input: ProfileInput,
  now: Clock = systemClock,
): DeclaredProfileView {
  const { given } = input;
  assertProfileValue('model', input.model);
  assertProfileValue('effort', input.effort);
  if (given !== undefined) assertProfileValue('harness', given);
  return transaction(db, () => {
    const harness = harnessOf(db, input);
    if (harness === undefined) {
      throw new OteaError(
        'invalid_profile',
        'Name the harness you run in too: --harness <name>, such as claude-code, codex or gemini-cli',
      );
    }
    const profile: Profile = { harness, model: input.model, effort: input.effort };
    const at = now();
    const changed = saveProfile(db, input.agent, profile, {
      at,
      channel: input.channel,
      confirmed: true,
    });
    return { agent: input.agent, profile: profileView(profile), confirmed: true, changed };
  });
}

// The exact way to declare a profile on the surface the agent uses.
export function profileCommand(agent: string, channel: AgentChannel): string {
  return channel === 'mcp'
    ? `the profile tool with as "${agent}", model <id> and effort <level>`
    : `otea profile --model <id> --effort <level> --as ${agent}`;
}

// The profile the agent stands on, refused when it declared none; with `confirmed`, also when it
// has not declared it again in this session (next offers no work until it does).
export function requireProfile(
  db: DatabaseSync,
  agent: string,
  { channel, confirmed = false }: { channel: AgentChannel; confirmed?: boolean },
): Profile {
  const declared = findProfile(db, agent);
  const how = profileCommand(agent, channel);
  if (!declared) {
    const harness =
      channel === 'cli' ? ' (add --harness <name> the first time, such as claude-code)' : '';
    throw new OteaError(
      'profile_required',
      `${agent} has no profile yet: declare the model and effort you run as, exactly as your harness names them, with ${how}${harness}`,
    );
  }
  if (confirmed && !declared.confirmed) {
    throw new OteaError(
      'profile_required',
      `${agent}'s profile (${profileLine(declared.profile)}) is not confirmed in this session: declare the model and effort you run as now with ${how}`,
    );
  }
  return declared.profile;
}

// The line every next ends with: the profile on record and how to update it.
export function profileReminder(profile: Profile, agent: string, channel: AgentChannel): string {
  return `Your profile: ${profileLine(profile)}. If you changed model or effort, update it: ${profileCommand(agent, channel)}`;
}

// The profile a person gives an agent they connect (otea connect): its harness is the MCP client's,
// named once the client connects, and the agent confirms it in its first session.
export function presetProfile(
  db: DatabaseSync,
  { agent, model, effort, given }: Omit<ProfileInput, 'channel' | 'harness'>,
  now: Clock = systemClock,
): ProfileView {
  assertProfileValue('model', model);
  assertProfileValue('effort', effort);
  if (given !== undefined) assertProfileValue('harness', given);
  const profile: Profile = { harness: given ?? 'mcp', model, effort };
  transaction(db, () =>
    saveProfile(db, agent, profile, { at: now(), channel: 'cli', confirmed: false }),
  );
  return profileView(profile);
}
