import { voipCancel, voipPrepare, voipStart, voipToken } from '@/lib/api';

import { ExotelVoice } from '../../../modules/exotel-voice/src';
import { MockVoipEngine } from './mock-engine.ts';
import { createNativeVoipEngine } from './native-engine.ts';
import type { VoipApi } from './place-call.ts';
import type { VoipCcmApi } from './place-call-ccm.ts';
import type { VoipEngine } from './types.ts';

export const voipApi: VoipApi = { prepare: voipPrepare, token: voipToken };
export const voipCcmApi: VoipCcmApi = { ...voipApi, start: voipStart, cancel: voipCancel };

let engine: VoipEngine | null | undefined;

// The engine the app uses. With EXPO_PUBLIC_VOIP_MOCK=true: the in-memory mock (no call, no network). With EXPO_PUBLIC_VOIP_NATIVE=true AND the native module
// present (only in a build from the `development-voip` EAS profile): the native engine; it still refuses to start until the module's SDK_ENABLED flag is turned
// on after Exotel's confirmation. Otherwise there is no engine, so the app keeps using the existing calling flow and nothing about it changes.
export function getVoipEngine(): VoipEngine | null {
  if (engine !== undefined) return engine;
  if (process.env.EXPO_PUBLIC_VOIP_MOCK === 'true') engine = new MockVoipEngine({ delays: { initiated: 50, ringing: 800, established: 2500, agentLeg: 600 } });
  else if (process.env.EXPO_PUBLIC_VOIP_NATIVE === 'true' && ExotelVoice) engine = createNativeVoipEngine(ExotelVoice);
  else engine = null;
  return engine;
}
