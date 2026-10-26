import type { Move } from './types.ts';

export type ActionState =
  | { step: 'choosing'; error?: string }
  | { step: 'explaining'; to: string; reason: string; error?: string }
  | { step: 'posting'; to: string; reason: string };

export type ActionEvent =
  | { type: 'explain'; to: string }
  | { type: 'type'; reason: string }
  | { type: 'cancel' }
  | { type: 'submit'; to: string; reason: string }
  | { type: 'failed'; message: string }
  | { type: 'succeeded' };

export type Tone = 'approve' | 'caution' | 'neutral';

export const IDLE: ActionState = { step: 'choosing' };

export function moveTone({ by, reasonRequired }: Move): Tone {
  if (reasonRequired) return 'caution';
  return by === 'agent' ? 'neutral' : 'approve';
}

export function reduceAction(state: ActionState, event: ActionEvent): ActionState {
  switch (event.type) {
    case 'explain':
      return { step: 'explaining', to: event.to, reason: '' };
    case 'type':
      return state.step === 'explaining' ? { ...state, reason: event.reason } : state;
    case 'cancel':
      return IDLE;
    case 'submit':
      return { step: 'posting', to: event.to, reason: event.reason };
    case 'failed':
      if (state.step !== 'posting') return state;
      if (state.reason === '') return { step: 'choosing', error: event.message };
      return { step: 'explaining', to: state.to, reason: state.reason, error: event.message };
    case 'succeeded':
      return IDLE;
  }
}

export function canConfirm(state: ActionState): boolean {
  return state.step === 'explaining' && state.reason.trim() !== '';
}

export function isBusy(state: ActionState): boolean {
  return state.step === 'posting';
}
