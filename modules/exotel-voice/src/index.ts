// JS side of the local module. `requireOptionalNativeModule` returns null in Expo Go, on web and in any build that does not include the module, so the
// app keeps working there (it just has no native VoIP engine).
import { requireOptionalNativeModule } from 'expo-modules-core';

export type ExotelVoiceNative = {
  sdkEnabled: boolean;
  initialize(hostname: string, accountSid: string, subscriberName: string, displayName: string, subscriberToken: string): Promise<void>;
  armIncoming(callRef: string): void;
  disarmIncoming(): void;
  hangup(): void;
  mute(on: boolean): void;
  speaker(on: boolean): void;
  addListener(event: 'onVoipEvent', listener: (e: { type: string; reason?: string | null }) => void): { remove(): void };
};

export const ExotelVoice = requireOptionalNativeModule<ExotelVoiceNative>('ExotelVoice');
