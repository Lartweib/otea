import { describe, expect, it } from 'vitest';
import { lastExchange, readStopEvent } from './claude-transcript.ts';

const line = (value: unknown) => JSON.stringify(value);

describe('a Claude Code transcript', () => {
  it('gives the text the agent wrote after the last message of the person', () => {
    const jsonl = [
      line({ type: 'user', timestamp: '2026-11-17T10:00:00.000Z', message: { content: 'hola' } }),
      line({
        type: 'assistant',
        timestamp: '2026-11-17T10:00:02.000Z',
        message: { content: [{ type: 'text', text: 'Respuesta vieja' }] },
      }),
      line({
        type: 'user',
        timestamp: '2026-11-17T10:05:00.000Z',
        message: { content: [{ type: 'text', text: '¿Por qué falla el build?' }] },
      }),
      line({
        type: 'assistant',
        timestamp: '2026-11-17T10:05:03.000Z',
        message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] },
      }),
      line({
        type: 'user',
        timestamp: '2026-11-17T10:05:04.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      }),
      line({
        type: 'assistant',
        timestamp: '2026-11-17T10:05:09.000Z',
        message: { content: [{ type: 'text', text: 'Falta una variable.' }] },
      }),
      line({
        type: 'assistant',
        timestamp: '2026-11-17T10:05:10.000Z',
        message: { content: [{ type: 'text', text: 'Detalle: X.' }] },
      }),
      'not json',
    ].join('\n');

    expect(lastExchange(jsonl)).toEqual({
      since: '2026-11-17T10:05:00.000Z',
      text: 'Falta una variable.\n\nDetalle: X.',
    });
  });

  it('has nothing to give when the agent wrote no text yet', () => {
    expect(
      lastExchange(line({ type: 'user', timestamp: 't', message: { content: 'hola' } })),
    ).toBeUndefined();
    expect(lastExchange('')).toBeUndefined();
  });

  it('reads the Stop event Claude Code sends on stdin', () => {
    expect(
      readStopEvent('{"session_id":"abc","transcript_path":"/tmp/t.jsonl","cwd":"/r"}'),
    ).toEqual({ session: 'abc', transcript: '/tmp/t.jsonl' });
    expect(readStopEvent('{}')).toBeUndefined();
    expect(readStopEvent('nope')).toBeUndefined();
  });
});
