import type { VoipEngine, VoipEngineEvent, VoipSession } from './types.ts';

export type MockDelays = { initiated: number; ringing: number; established: number; agentLeg: number };

// In-memory stand-in for the Exotel Voice SDK. It places NO call, opens no network connection and never touches the microphone: it only walks through
// the same events the real SDK reports, so the screens and the flow can be tested without Exotel.
export type MockOptions = {
  delays?: Partial<MockDelays>; failDial?: string; failInit?: string;
  /** CCM flow: 'never' = Exotel's agent leg never reaches the app (a long `delays.agentLeg` also works: it arrives too late). */
  agentLeg?: 'arrives' | 'never';
  /** CCM flow: how the call ends after the agent leg is answered: customer answers (default), does not answer, or the network drops. */
  customer?: 'answers' | 'no-answer' | 'network-loss';
};

export class MockVoipEngine implements VoipEngine {
  readonly isMock = true;
  dialled: { sipExophone: string; callRef: string } | null = null;
  initialisedWith: VoipSession | null = null;
  muted = false;
  speakerOn = false;
  private listeners = new Set<(e: VoipEngineEvent) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private live = false;

  /** CCM flow bookkeeping, for tests. `incomingUiShown` must stay false: this flow never shows an incoming call. */
  armedFor: string | null = null;
  autoAnswered = false;
  incomingUiShown = false;
  rejectedLegs = 0;

  private readonly opts: MockOptions;
  constructor(opts: MockOptions = {}) {
    this.opts = opts;
  }

  async initialize(session: VoipSession): Promise<void> {
    if (this.opts.failInit) throw new Error(this.opts.failInit);
    this.initialisedWith = session;
  }

  dial(sipExophone: string, callRef: string): void {
    this.dialled = { sipExophone, callRef };
    const d: MockDelays = { initiated: 20, ringing: 300, established: 1200, agentLeg: 300, ...this.opts.delays };
    this.live = true;
    this.at(d.initiated, { type: 'initiated' });
    if (this.opts.failDial) { this.at(d.ringing, { type: 'failed', reason: this.opts.failDial }); return; }
    this.at(d.initiated + d.ringing, { type: 'ringing' });
    this.at(d.initiated + d.ringing + d.established, { type: 'established' });
  }

  // CCM flow. The mock starts the clock when armed, because the app calls /voip/start right after arming; the real engine reacts to the SDK instead.
  armIncoming(callRef: string): void {
    this.armedFor = callRef;
    this.live = true;
    const d: MockDelays = { initiated: 20, ringing: 300, established: 1200, agentLeg: 300, ...this.opts.delays };
    if (this.opts.agentLeg === 'never') return;
    this.timers.push(setTimeout(() => {
      if (this.armedFor !== callRef) { this.rejectedLegs++; return; } // disarmed meanwhile: reject, never answer
      this.autoAnswered = true; // answered silently: no ringtone, no notification, no Answer button
      this.emit({ type: 'agent_leg' });
      if (this.opts.customer === 'network-loss') { this.timers.push(setTimeout(() => { this.live = false; this.emit({ type: 'failed', reason: 'network lost' }); }, d.ringing)); return; }
      this.timers.push(setTimeout(() => this.emit({ type: 'ringing' }), d.ringing));
      if (this.opts.customer === 'no-answer') {
        this.timers.push(setTimeout(() => { this.live = false; this.emit({ type: 'ended', reason: 'customer did not answer' }); }, d.ringing + d.established));
        return;
      }
      this.timers.push(setTimeout(() => this.emit({ type: 'established' }), d.ringing + d.established));
    }, d.agentLeg));
  }

  disarmIncoming(): void {
    this.armedFor = null;
  }

  hangup(): void {
    this.armedFor = null;
    this.clear();
    if (this.live) { this.live = false; this.emit({ type: 'ended', reason: 'hung up' }); }
  }

  mute(on: boolean): void { this.muted = on; }
  speaker(on: boolean): void { this.speakerOn = on; }

  subscribe(listener: (e: VoipEngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private at(ms: number, e: VoipEngineEvent) {
    this.timers.push(setTimeout(() => { if (e.type === 'failed') this.live = false; this.emit(e); }, ms));
  }
  private emit(e: VoipEngineEvent) { for (const l of [...this.listeners]) l(e); }
  private clear() { this.timers.forEach(clearTimeout); this.timers = []; }
}
