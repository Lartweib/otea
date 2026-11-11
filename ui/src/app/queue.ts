// Data writes go one at a time (mock:3620): moves, links, creation. Gestures never wait on it:
// opening, closing, switching views, folding and menus are never queued (SPEC §3.2).
export type Queue = { run<T>(fn: () => Promise<T> | T): Promise<T> };

export function makeQueue(onError: (error: unknown) => void = (e) => console.warn(e)): Queue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(fn: () => Promise<T> | T): Promise<T> {
      const result = tail.then(fn);
      tail = result.catch(onError);
      return result;
    },
  };
}

export const Q: Queue = makeQueue();
