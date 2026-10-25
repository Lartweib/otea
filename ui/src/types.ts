export type Turn = 'human' | 'agent' | 'none';

export type Actor = { kind: 'human' | 'agent'; name: string };

export type Item = {
  id: string;
  collection: string;
  title: string;
  body: string;
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
