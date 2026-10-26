import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChangeFeed, createChangeFeed } from './changes.ts';
import { tempDatabase } from './testing.ts';

describe('createChangeFeed', () => {
  let temp: ReturnType<typeof tempDatabase>;
  let own: DatabaseSync;
  let other: DatabaseSync;
  let feed: ChangeFeed;

  const commitFrom = (db: DatabaseSync) => db.exec("INSERT INTO notes VALUES ('x')");
  const tick = () => vi.advanceTimersByTime(250);

  beforeEach(() => {
    vi.useFakeTimers();
    temp = tempDatabase();
    own = temp.open();
    own.exec('CREATE TABLE notes (text TEXT)');
    other = temp.open();
    feed = createChangeFeed(own, 250);
  });

  afterEach(() => {
    feed.close();
    own.close();
    other.close();
    temp.remove();
    vi.useRealTimers();
  });

  it('notifies every subscriber when another connection commits', () => {
    const first = vi.fn();
    const second = vi.fn();
    feed.subscribe(first);
    feed.subscribe(second);

    commitFrom(other);
    tick();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('notifies once per poll, not again without new commits', () => {
    const listener = vi.fn();
    feed.subscribe(listener);

    commitFrom(other);
    commitFrom(other);
    tick();
    tick();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('notifies every subscriber right away for a write made on its own connection', () => {
    const first = vi.fn();
    const second = vi.fn();
    feed.subscribe(first);
    feed.subscribe(second);

    commitFrom(own);
    feed.notify();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('ignores commits from its own connection', () => {
    const listener = vi.fn();
    feed.subscribe(listener);

    commitFrom(own);
    tick();

    expect(listener).not.toHaveBeenCalled();
  });

  it('runs one shared poller only while someone is subscribed', () => {
    expect(vi.getTimerCount()).toBe(0);

    const unsubscribeFirst = feed.subscribe(vi.fn());
    const unsubscribeSecond = feed.subscribe(vi.fn());
    expect(vi.getTimerCount()).toBe(1);

    unsubscribeFirst();
    expect(vi.getTimerCount()).toBe(1);
    unsubscribeSecond();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops polling and drops subscribers on close', () => {
    const listener = vi.fn();
    feed.subscribe(listener);

    feed.close();
    commitFrom(other);
    tick();

    expect(vi.getTimerCount()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
});
