import { describe, expect, it } from 'vitest';
import { actorX, layoutTimeline } from './timeline.ts';

describe('actorX', () => {
  it('puts what you did on your lane and what an agent did on the agent lane', () => {
    expect(actorX('human')).toBe(40);
    expect(actorX('agent')).toBe(16);
  });
});

describe('layoutTimeline', () => {
  it('stacks the current state and then each event, centring every node on its block', () => {
    const layout = layoutTimeline({ height: 40, x: 40 }, [
      { height: 44, x: 40 },
      { height: 60, x: 16 },
    ]);

    expect(layout.height).toBe(144);
    expect(layout.now).toEqual({ x: 40, y: 20 });
    expect(layout.stops).toEqual([
      { x: 40, y: 62 },
      { x: 16, y: 114 },
    ]);
  });

  it('runs straight down while the lane stays and swings across when it changes', () => {
    const layout = layoutTimeline({ height: 40, x: 16 }, [
      { height: 40, x: 16 },
      { height: 40, x: 40 },
      { height: 40, x: 40 },
    ]);

    expect(layout.path).toBe('M16 20 V60 C16 80 40 80 40 100 V140');
  });

  it('starts on the trunk for a closed item and swings out to the lane of the last event', () => {
    const layout = layoutTimeline({ height: 40, x: 28 }, [{ height: 40, x: 40 }]);

    expect(layout.path).toBe('M28 20 C28 40 40 40 40 60');
  });

  it('draws only the current state when there are no events yet', () => {
    const layout = layoutTimeline({ height: 40, x: 16 }, []);

    expect(layout.path).toBe('M16 20');
    expect(layout.stops).toEqual([]);
  });

  it('draws both lanes as quiet guides over the full height', () => {
    expect(layoutTimeline({ height: 40, x: 16 }, [{ height: 40, x: 40 }]).guides).toBe(
      'M16 0 V80 M40 0 V80',
    );
  });
});
