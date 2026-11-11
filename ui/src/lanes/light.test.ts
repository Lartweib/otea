import { describe, expect, it } from 'vitest';
import { laneParams } from './geometry.ts';
import { lightMarkup } from './light.ts';

const p = (atasco = false) => ({
  ...laneParams([], 400, 600, atasco),
  ys: [40, 120],
  as: [200],
  ws: [260],
});

describe('the lane light', () => {
  it('lights 60 px of your lane at each of your nodes, with a halo, breathing out of step', () => {
    const { halos } = lightMarkup(p());
    expect(halos).toContain(
      '<g class="gl" transform="translate(40.5 40)" style="animation-delay:0.0s">',
    );
    expect(halos).toContain('style="animation-delay:-0.9s"');
    expect(halos).toContain(
      '<rect x="-2" y="-30" width="4" height="60" fill="url(#gB)" style="filter:blur(2.4px);opacity:var(--glow-lit)"/>',
    );
    expect(halos).toContain('<rect x="-.75" y="-30" width="1.5" height="60" fill="url(#gB)"/>');
    expect(halos).toContain(
      '<circle r="13" fill="var(--you)" opacity=".3" style="filter:blur(6px)"/>',
    );
    expect(halos).toContain(
      '<circle r="7.5" fill="var(--you)" opacity=".5" style="filter:blur(2.5px)"/>',
    );
  });

  it('lights 30 px each way at a working agent and 22 px in red at a stuck one', () => {
    const { ags, warms } = lightMarkup(p());
    expect(ags).toContain('translate(16.5 200)');
    expect(ags).toContain('y="-30" width="4" height="60" fill="url(#gL)"');
    expect(ags).toContain(
      '<circle r="10" fill="var(--lane-lit)" opacity=".26" style="filter:blur(4.5px)"/>',
    );
    expect(warms).toContain('translate(16.5 260)');
    expect(warms).toContain('y="-22" width="4" height="44" fill="url(#gR)"');
    expect(warms).toContain('fill="var(--warn)" opacity=".32"');
  });

  it('lights only the stuck in Atasco', () => {
    const m = lightMarkup(p(true));
    expect(m.halos).toBe('');
    expect(m.ags).toBe('');
    expect(m.warms).not.toBe('');
  });
});
