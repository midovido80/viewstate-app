import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  AppState,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import {
  BrainRequestError,
  executeBrainRequest,
  type BrainPresentation,
} from '@/services/brain';
import {
  createPushToTalkLifecycle,
  startPermittedRecording,
  transcribeRecording,
  VoiceRequestError,
  type VoiceLifecycle,
} from '@/services/brainVoice';
import { BrainResults } from '@/components/BrainResults';

type VoiceStatus = 'idle' | 'recording' | 'transcribing' | 'permission' | 'error';

export default function BrainScreen() {
  const colors = useColors();
  const { t, isRTL, fonts, language } = useI18n();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const lifecycle = useRef<VoiceLifecycle | null>(null);
  const stopping = useRef(false);
  const starting = useRef(false);
  const recordingActive = useRef(false);
  const mounted = useRef(true);
  const requestGeneration = useRef(0);
  const intentController = useRef<AbortController | null>(null);
  const maximumRecordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<BrainPresentation | null>(null);
  const [error, setError] = useState('');
  const [executing, setExecuting] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  if (!lifecycle.current) lifecycle.current = createPushToTalkLifecycle(
    recorder,
    transcribeRecording,
    () => setAudioModeAsync({ allowsRecording: false }),
  );

  const stopAndTranscribe = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (maximumRecordingTimer.current) {
      clearTimeout(maximumRecordingTimer.current);
      maximumRecordingTimer.current = null;
    }
    const generation = ++requestGeneration.current;
    if (mounted.current) {
      setVoiceStatus('transcribing');
      setError('');
    }
    recordingActive.current = false;
    try {
      const transcript = await lifecycle.current!.stop();
      if (mounted.current && generation === requestGeneration.current) {
        setText(transcript);
        setVoiceStatus('idle');
      }
    } catch (caught) {
      if (mounted.current && generation === requestGeneration.current) {
        setVoiceStatus('error');
        setError(t(voiceErrorKey(caught)));
      }
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      stopping.current = false;
    }
  }, [t]);

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 30_000) {
      void stopAndTranscribe();
    }
  }, [recorderState.durationMillis, recorderState.isRecording, stopAndTranscribe]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        requestGeneration.current += 1;
        intentController.current?.abort();
        intentController.current = null;
        if (maximumRecordingTimer.current) {
          clearTimeout(maximumRecordingTimer.current);
          maximumRecordingTimer.current = null;
        }
        recordingActive.current = false;
        void lifecycle.current?.cancel().catch(() => undefined);
        void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        if (mounted.current) {
          setVoiceStatus('idle');
          setExecuting(false);
        }
        return;
      }
      void getRecordingPermissionsAsync().then(permission => {
        if (!mounted.current || permission.granted) {
          if (permission.granted) {
            setPermissionBlocked(false);
            setVoiceStatus(current => current === 'permission' ? 'idle' : current);
          }
          return;
        }
        setPermissionBlocked(permission.canAskAgain === false);
      }).catch(() => undefined);
    });
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
      intentController.current?.abort();
      intentController.current = null;
      if (maximumRecordingTimer.current) clearTimeout(maximumRecordingTimer.current);
      recordingActive.current = false;
      void lifecycle.current?.cancel().catch(() => undefined);
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      subscription.remove();
    };
  }, []);
  useFocusEffect(useCallback(() => () => {
    requestGeneration.current += 1;
    intentController.current?.abort();
    intentController.current = null;
    if (maximumRecordingTimer.current) clearTimeout(maximumRecordingTimer.current);
    recordingActive.current = false;
    void lifecycle.current?.cancel().catch(() => undefined);
    void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    if (mounted.current) setVoiceStatus('idle');
    if (mounted.current) setExecuting(false);
  }, []));

  const toggleRecording = async () => {
    if (starting.current || stopping.current) return;
    if (voiceStatus === 'recording' || recorderState.isRecording) {
      await stopAndTranscribe();
      return;
    }
    setError('');
    starting.current = true;
    const generation = ++requestGeneration.current;
    try {
      const started = await startPermittedRecording(
        requestRecordingPermissionsAsync,
        setAudioModeAsync,
        lifecycle.current!,
      );
      if (!started) {
        if (!mounted.current || generation !== requestGeneration.current) return;
        setVoiceStatus('permission');
        const permission = await getRecordingPermissionsAsync().catch(() => null);
        setPermissionBlocked(permission?.canAskAgain === false);
        setError(t(permission?.canAskAgain === false
          ? 'brain.voice.permission.permanent'
          : 'brain.voice.permission'));
        return;
      }
      if (!mounted.current || generation !== requestGeneration.current) {
        await lifecycle.current?.cancel().catch(() => undefined);
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        return;
      }
      recordingActive.current = true;
      setVoiceStatus('recording');
      // Stop ourselves just before the native duration cutoff so that the
      // completed file is always sent for transcription.
      maximumRecordingTimer.current = setTimeout(() => {
        void stopAndTranscribe();
      }, 29_800);
    } catch (caught) {
      if (mounted.current && generation === requestGeneration.current) {
        setVoiceStatus('error');
        setError(t(voiceErrorKey(caught)));
      }
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    } finally {
      starting.current = false;
    }
  };

  const execute = async (requestOverride?: string) => {
    const request = (requestOverride ?? text).trim();
    if (!request) {
      setError(t('brain.empty'));
      return;
    }
    const generation = ++requestGeneration.current;
    intentController.current?.abort();
    const controller = new AbortController();
    intentController.current = controller;
    setExecuting(true);
    setError('');
    setResult(null);
    try {
      const response = await executeBrainRequest(request, language, { signal: controller.signal });
      if (mounted.current && generation === requestGeneration.current) setResult(response);
    } catch (caught) {
      if (mounted.current && generation === requestGeneration.current) setError(t(intentErrorKey(caught)));
    } finally {
      if (intentController.current === controller) intentController.current = null;
      if (mounted.current && generation === requestGeneration.current) setExecuting(false);
    }
  };

  const recording = voiceStatus === 'recording';
  const transcribing = voiceStatus === 'transcribing';
  const voiceLabel = transcribing
    ? t('brain.voice.transcribing')
    : recording ? t('brain.voice.recording') : t('brain.voice.start');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingTop: topInset + 16, paddingBottom: insets.bottom + 112 }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        bottomOffset={72}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('brain.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{t('brain.subtitle')}</Text>

        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>{t('brain.input.label')}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={5}
          placeholder={t('brain.input.placeholder')}
          placeholderTextColor={colors.mutedForeground}
          editable={!executing}
          testID="brain-input"
          accessibilityLabel={t('brain.input.label')}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.inputRadius, color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}
        />

        <TouchableOpacity
          onPress={() => void toggleRecording()}
          disabled={transcribing || executing}
          testID="brain-microphone"
          accessibilityRole="button"
          accessibilityLabel={recording ? t('brain.voice.stop') : voiceLabel}
          accessibilityState={{ disabled: transcribing || executing, busy: transcribing }}
          style={[styles.voice, { borderColor: recording ? colors.primary : colors.border, backgroundColor: recording ? colors.accent : colors.card, flexDirection: isRTL ? 'row-reverse' : 'row', opacity: transcribing || executing ? 0.6 : 1 }]}
        >
          <Feather name={recording ? 'square' : 'mic'} size={20} color={recording ? colors.primary : colors.turquoise} />
          <View style={styles.voiceCopy}>
            <Text style={[styles.voiceTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{voiceLabel}</Text>
            <Text style={[styles.voiceHint, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{t('brain.voice.max')}</Text>
          </View>
        </TouchableOpacity>

        {error ? <Text testID="brain-error" style={[styles.error, { color: colors.destructive, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{error}</Text> : null}
        {voiceStatus === 'permission' && permissionBlocked && Platform.OS !== 'web' ? (
          <TouchableOpacity
            onPress={() => void Linking.openSettings().catch(() => undefined)}
            testID="brain-open-microphone-settings"
            accessibilityRole="button"
            style={[styles.settings, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{t('brain.voice.settings')}</Text>
          </TouchableOpacity>
        ) : null}
        <Button title={executing ? t('brain.executing') : t('brain.execute')} onPress={() => void execute()} loading={executing} disabled={transcribing || recording} testID="brain-execute" />

        <Text style={[styles.hintsTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('brain.hints.title')}</Text>
        {(['brain.hint.properties', 'brain.hint.people', 'brain.hint.match'] as const).map(key => (
          <TouchableOpacity
            key={key}
            testID={`brain-suggestion-${key.split('.').at(-1)}`}
            onPress={() => {
              const suggestion = t(key);
              setText(suggestion);
              void execute(suggestion);
            }}
            disabled={executing || transcribing || recording}
            style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row', opacity: executing || transcribing || recording ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <Feather name="arrow-up-right" size={16} color={colors.turquoise} />
            <Text style={[styles.hintText, { color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{t(key)}</Text>
          </TouchableOpacity>
        ))}

        {result ? <BrainResults result={result} /> : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function intentErrorKey(error: unknown):
  'brain.error.network' | 'brain.error.server' | 'brain.error.timeout' | 'brain.error.response' {
  if (!(error instanceof BrainRequestError)) return 'brain.error.network';
  if (error.code === 'INTENT_TIMEOUT') return 'brain.error.timeout';
  if (error.code === 'INTENT_INVALID_RESPONSE') return 'brain.error.response';
  return error.code === 'INTENT_SERVER' ? 'brain.error.server' : 'brain.error.network';
}

function voiceErrorKey(error: unknown):
  | 'brain.voice.error.recorder'
  | 'brain.voice.error.noFile'
  | 'brain.voice.error.empty'
  | 'brain.voice.error.timeout'
  | 'brain.voice.error.network'
  | 'brain.voice.error.server'
  | 'brain.voice.error.response' {
  if (!(error instanceof VoiceRequestError)) return 'brain.voice.error.recorder';
  if (error.code === 'RECORDING_NO_FILE') return 'brain.voice.error.noFile';
  if (error.code === 'TRANSCRIPTION_EMPTY') return 'brain.voice.error.empty';
  if (error.code === 'TRANSCRIPTION_TIMEOUT') return 'brain.voice.error.timeout';
  if (error.code === 'RECORDER_INIT' || error.code === 'RECORDER_STOP') return 'brain.voice.error.recorder';
  if (error.code === 'TRANSCRIPTION_SERVER') return 'brain.voice.error.server';
  if (error.code === 'TRANSCRIPTION_INVALID_RESPONSE') return 'brain.voice.error.response';
  return 'brain.voice.error.network';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 28, marginBottom: 6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 15, marginBottom: 8 },
  input: { borderWidth: 1, minHeight: 130, padding: 14, fontSize: 16, textAlignVertical: 'top', marginBottom: 14 },
  voice: { borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 12, marginBottom: 14 },
  voiceCopy: { flex: 1 },
  voiceTitle: { fontSize: 15, marginBottom: 2 },
  voiceHint: { fontSize: 13 },
  error: { fontSize: 14, marginBottom: 14 },
  settings: { borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', marginTop: -6, marginBottom: 14 },
  hintsTitle: { fontSize: 17, marginTop: 28, marginBottom: 10 },
  hint: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 10, alignItems: 'center', marginBottom: 8 },
  hintText: { flex: 1, fontSize: 14 },
});