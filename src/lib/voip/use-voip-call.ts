import { useCallback, useEffect, useRef, useState } from 'react';

import { IDLE } from './call-machine.ts';
import { placeVoipCall, type VoipApi, type VoipCallHandle } from './place-call.ts';
import { placeVoipCcmCall, type VoipCcmApi } from './place-call-ccm.ts';
import type { VoipEngine, VoipState } from './types.ts';

// Holds the state of the one VoIP call the screen is showing. `start` begins a call; `hangup`, `mute`, `speaker` act on it; `dismiss` clears a finished one.
// `ccmApi` is set only when the backend says the CCM flow is on; then `start` uses it instead of the Dial Whom flow.
export function useVoipCall(engine: VoipEngine | null, api: VoipApi, ccmApi?: VoipCcmApi | null) {
  const [state, setState] = useState<VoipState>(IDLE);
  const handle = useRef<VoipCallHandle | null>(null);

  useEffect(() => () => { handle.current?.dispose(); }, []);

  const start = useCallback((digits: string) => {
    if (!engine) return;
    handle.current?.dispose();
    handle.current = ccmApi ? placeVoipCcmCall({ api: ccmApi, engine, digits, onState: setState }) : placeVoipCall({ api, engine, digits, onState: setState });
  }, [api, ccmApi, engine]);

  return {
    state,
    start,
    hangup: useCallback(() => handle.current?.hangup(), []),
    mute: useCallback((on: boolean) => handle.current?.mute(on), []),
    speaker: useCallback((on: boolean) => handle.current?.speaker(on), []),
    dismiss: useCallback(() => { handle.current?.dispose(); handle.current = null; setState(IDLE); }, []),
  };
}
