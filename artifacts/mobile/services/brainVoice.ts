/**
 * Small, injectable boundary around recorder lifecycle and transcription.
 * The screen supplies the Expo recorder; tests can supply this contract instead.
 */
import { publicApiUrl } from '@/services/runtimeApi';

export interface VoiceRecorder {
  uri: string | null;
  prepareToRecordAsync(): Promise<void>;
  record(options?: { forDuration?: number }): void;
  stop(): Promise<void>;
}

export interface VoiceLifecycle {
  start(): Promise<void>;
  stop(): Promise<string>;
  cancel(): Promise<void>;
}

export type VoiceErrorCode =
  | 'RECORDER_INIT' | 'RECORDER_STOP' | 'RECORDING_NO_FILE' | 'TRANSCRIPTION_EMPTY'
  | 'TRANSCRIPTION_ABORTED' | 'TRANSCRIPTION_TIMEOUT'
  | 'TRANSCRIPTION_NETWORK' | 'TRANSCRIPTION_SERVER' | 'TRANSCRIPTION_INVALID_RESPONSE';

export class VoiceRequestError extends Error {
  constructor(readonly code: VoiceErrorCode) {
    super(code);
    this.name = 'VoiceRequestError';
  }
}

export type Transcribe = (uri: string, signal?: AbortSignal) => Promise<string>;
export type RecordingPermission = {
  readonly granted: boolean;
  readonly canAskAgain?: boolean;
};
export type RequestRecordingPermission = () => Promise<RecordingPermission>;
export type SetRecordingAudioMode = (
  mode: { readonly allowsRecording: boolean; readonly playsInSilentMode?: boolean },
) => Promise<void>;

export async function startPermittedRecording(
  requestPermission: RequestRecordingPermission,
  setAudioMode: SetRecordingAudioMode,
  lifecycle: Pick<VoiceLifecycle, 'start'>,
): Promise<boolean> {
  const permission = await requestPermission();
  if (!permission.granted) return false;
  await setAudioMode({ allowsRecording: true, playsInSilentMode: true });
  try {
    await lifecycle.start();
  } catch (error) {
    await setAudioMode({ allowsRecording: false }).catch(() => undefined);
    throw error;
  }
  return true;
}

export function createPushToTalkLifecycle(
  recorder: VoiceRecorder,
  transcribe: Transcribe,
  resetAudioMode?: () => Promise<void>,
): VoiceLifecycle {
  let recording = false;
  let stopping: Promise<string> | null = null;
  let transcriptionController: AbortController | null = null;
  let cancelRequested = false;
  return {
    async start() {
      if (recording) throw new Error('A recording is already active.');
      cancelRequested = false;
      try {
        await recorder.prepareToRecordAsync();
      } catch {
        throw new VoiceRequestError('RECORDER_INIT');
      }
      // This is deliberately half-duplex: no transcription happens until stop.
      recorder.record({ forDuration: 30 });
      recording = true;
    },
    async stop() {
      if (stopping) return stopping;
      stopping = (async () => {
        try {
          try {
            await recorder.stop();
          } catch {
            throw new VoiceRequestError('RECORDER_STOP');
          } finally {
            recording = false;
            // The native input route must be released even when stop fails.
            if (resetAudioMode) await resetAudioMode().catch(() => undefined);
          }
          // The native input route is released before the network wait.
          if (cancelRequested) throw new VoiceRequestError('TRANSCRIPTION_ABORTED');
          if (!recorder.uri) throw new VoiceRequestError('RECORDING_NO_FILE');
          transcriptionController = new AbortController();
          const transcript = await transcribe(recorder.uri, transcriptionController.signal);
          if (!transcript.trim()) throw new VoiceRequestError('TRANSCRIPTION_EMPTY');
          return transcript.trim();
        } finally {
          transcriptionController = null;
          stopping = null;
          cancelRequested = false;
        }
      })();
      return stopping;
    },
    async cancel() {
      cancelRequested = true;
      transcriptionController?.abort();
      if (stopping) {
        return;
      }
      if (!recording) return;
      try {
        await recorder.stop();
      } finally {
        recording = false;
        cancelRequested = false;
        if (resetAudioMode) await resetAudioMode().catch(() => undefined);
      }
    },
  };
}

function transcriptionUrl(): string {
  const url = publicApiUrl('/api/brain/transcribe');
  if (!url) throw new VoiceRequestError('TRANSCRIPTION_NETWORK');
  return url;
}

export async function transcribeRecording(uri: string, signal?: AbortSignal): Promise<string> {
  const body = new FormData();
  body.append('audio', {
    uri,
    name: 'brain-request.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);
  const response = await fetchWithTimeout(
    transcriptionUrl(),
    { method: 'POST', body },
    30_000,
    signal,
  );
  if (!response.ok) throw new VoiceRequestError('TRANSCRIPTION_SERVER');
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new VoiceRequestError('TRANSCRIPTION_INVALID_RESPONSE');
  }
  if (!payload || typeof payload !== 'object' || !('transcript' in payload) || typeof payload.transcript !== 'string') {
    throw new VoiceRequestError('TRANSCRIPTION_INVALID_RESPONSE');
  }
  return payload.transcript;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  upstreamSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new VoiceRequestError('TRANSCRIPTION_TIMEOUT');
    if (upstreamSignal?.aborted) throw new VoiceRequestError('TRANSCRIPTION_ABORTED');
    throw new VoiceRequestError('TRANSCRIPTION_NETWORK');
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', abort);
  }
}