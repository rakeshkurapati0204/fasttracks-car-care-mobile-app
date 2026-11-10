import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PickedFile } from '@/lib/upload';

const MAX_SECONDS = 300; // auto-stop at 5 minutes, like the dashboard

// Voice-note recorder (tap mic → record, tap again → stop & send, or Cancel).
export function useVoiceRecorder(onFinished: (file: PickedFile) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const cancelled = useRef(false);

  const clearTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);

  const finish = useCallback(async (send: boolean) => {
    clearTimer();
    cancelled.current = !send;
    try {
      await recorder.stop();
    } catch { /* already stopped */ }
    setRecording(false);
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (!send) return;
    const uri = recorder.uri;
    if (secondsRef.current < 1 || !uri) { setError('Voice note too short — hold on a second longer'); return; }
    onFinished({ uri, name: `voice-${Date.now()}.m4a`, mimeType: 'audio/mp4' });
  }, [recorder, onFinished]);

  const start = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission is blocked for this app — allow it in your phone Settings, then try again.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError('Could not access the microphone. Close other apps using it and try again.');
      return;
    }
    setError(null);
    cancelled.current = false;
    secondsRef.current = 0;
    setSeconds(0);
    setRecording(true);
    clearTimer();
    timer.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) finish(true);
    }, 1000);
  }, [recorder, finish]);

  return {
    recording, seconds, error, clearError: () => setError(null),
    start, stopAndSend: () => finish(true), cancel: () => finish(false),
  };
}
