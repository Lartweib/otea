export type Turn = 'human' | 'agent' | 'none';

export type Actor = { kind: 'human' | 'agent'; name: string };

export type Item = {
  id: string;
  collection: string;
  title: string;
  fields: Record<string, string>;
  presetVersion: number;
  state: string;
  turn: Turn;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
};

export type ItemEvent = {
  id: number;
  type: string;
  actor: Actor;
  at: string;
  data: Record<string, unknown>;
};

export type ItemWithEvents = Item & { events: ItemEvent[] };

export type Authority = 'agent' | 'human' | 'human-ui';

export type Move = { to: string; by: Authority; reasonRequired: boolean };

export type ItemView = ItemWithEvents & { transitions: Move[]; missing: string[] };

export type Session = { canWrite: boolean };
