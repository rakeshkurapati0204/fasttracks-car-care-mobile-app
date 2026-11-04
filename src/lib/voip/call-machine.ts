import type { VoipEvent, VoipState } from './types.ts';

export const IDLE: VoipState = { phase: 'idle', number: null, muted: false, speaker: false, connectedAt: null, error: null, endedReason: null };

const ACTIVE = new Set(['preparing', 'dialing', 'calling', 'ringing', 'connected']);
const TERMINAL = new Set(['ended', 'failed']);

// A small, strict state machine: a late or duplicate event from the SDK can never move a finished call back to life.
export function voipReducer(state: VoipState, e: VoipEvent): VoipState {
  switch (e.type) {
    case 'START':
      return ACTIVE.has(state.phase) ? state : { ...IDLE, phase: 'preparing', number: e.number };
    case 'RESET':
      return IDLE;
    case 'PREPARED':
      return state.phase === 'preparing' ? { ...state, phase: 'dialing' } : state;
    case 'INITIATED':
      return state.phase === 'preparing' || state.phase === 'dialing' ? { ...state, phase: 'dialing' } : state;
    case 'AGENT_LEG': // CCM flow: our own agent leg was answered silently; Exotel is now calling the customer
      return state.phase === 'dialing' || state.phase === 'preparing' ? { ...state, phase: 'calling' } : state;
    case 'RINGING':
      return state.phase === 'dialing' || state.phase === 'preparing' || state.phase === 'calling' ? { ...state, phase: 'ringing' } : state;
    case 'ESTABLISHED':
      return state.phase === 'dialing' || state.phase === 'calling' || state.phase === 'ringing' ? { ...state, phase: 'connected', connectedAt: e.at } : state;
    case 'ENDED':
      return ACTIVE.has(state.phase) ? { ...state, phase: 'ended', endedReason: e.reason ?? null } : state;
    case 'FAILED':
      return ACTIVE.has(state.phase) ? { ...state, phase: 'failed', error: e.error } : state;
    case 'MUTE':
      return ACTIVE.has(state.phase) ? { ...state, muted: e.value } : state;
    case 'SPEAKER':
      return ACTIVE.has(state.phase) ? { ...state, speaker: e.value } : state;
    default:
      return state;
  }
}

export const isFinished = (s: VoipState) => TERMINAL.has(s.phase);
export const isActive = (s: VoipState) => ACTIVE.has(s.phase);

export function statusText(s: VoipState): string {
  switch (s.phase) {
    case 'preparing': return 'Preparing the call...';
    case 'dialing': return 'Connecting...';
    case 'calling': return 'Calling customer...';
    case 'ringing': return 'Customer ringing...';
    case 'connected': return 'Connected';
    case 'ended': return s.endedReason ? `Call ended (${s.endedReason})` : 'Call ended';
    case 'failed': return s.error ?? 'The call could not be placed';
    default: return '';
  }
}

// m:ss since the call was connected; 0:00 before that.
export function elapsedText(s: VoipState, now: number): string {
  if (s.connectedAt === null) return '0:00';
  const sec = Math.max(0, Math.floor((now - s.connectedAt) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
