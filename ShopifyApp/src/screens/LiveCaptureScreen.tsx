import React, { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import Tts from 'react-native-tts';
import Wearables, { wearablesEmitter } from '../../WearablesModule';
import { useShoppingStore, type CaptureMessage } from '../store/shoppingStore';
import BarcodeScanScreen from './BarcodeScanScreen';

const BACKEND_URL = 'http://192.168.0.252:8080';
const PASSIVE_POLL_MS = 3000;

let didRegister = false;
let didGrantPermission = false;

type StreamState = 'stopped' | 'waitingForDevice' | 'starting' | 'streaming' | 'paused';

function AssistantBubble({ msg, onFeedback }: {
  msg: CaptureMessage;
  onFeedback: (id: string, feedback: 'up' | 'down') => void;
}) {
  return (
    <View style={styles.bubbleGroup}>
      <View style={styles.assistantBubbleWrap}>
        <Text style={styles.bubbleLabel}>Assistant</Text>
        <View style={styles.assistantBubble}>
          <Text style={styles.assistantBubbleText}>{msg.content}</Text>
        </View>
        {!msg.feedback && (
          <View style={styles.feedbackRow}>
            <Pressable style={styles.feedbackBtn} onPress={() => onFeedback(msg.id, 'up')}>
              <Text style={styles.feedbackIcon}>👍</Text>
            </Pressable>
            <Pressable style={styles.feedbackBtn} onPress={() => onFeedback(msg.id, 'down')}>
              <Text style={styles.feedbackIcon}>👎</Text>
            </Pressable>
          </View>
        )}
        {msg.feedback && (
          <Text style={styles.feedbackGiven}>
            {msg.feedback === 'up' ? '👍' : '👎'}
          </Text>
        )}
      </View>
      {msg.sessionEnd && (
        <View style={styles.sessionEndRow}>
          <View style={styles.sessionEndLine} />
          <Text style={styles.sessionEndText}>Session ended</Text>
          <View style={styles.sessionEndLine} />
        </View>
      )}
    </View>
  );
}

function UserBubble({ msg }: { msg: CaptureMessage }) {
  return (
    <View style={styles.userBubbleWrap}>
      <Text style={styles.bubbleLabelRight}>You said</Text>
      <View style={styles.userBubble}>
        <Text style={styles.userBubbleText}>{msg.content}</Text>
      </View>
    </View>
  );
}

export default function LiveCaptureScreen() {
  const {
    captureMessages,
    captureMode,
    storeMap,
    addCaptureMessage,
    setCaptureFeedback,
    endCaptureSession,
    setCaptureMode,
  } = useShoppingStore();

  const [streamState, setStreamState] = React.useState<StreamState>('stopped');
  const [isPTTHeld, setIsPTTHeld] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = React.useState(false);
  const [loadType, setLoadType] = React.useState(0);
  const [confidence, setConfidence] = React.useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const transcriptRef = useRef<string>('');

  // Passive agent refs
  const passiveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const passiveInFlightRef = useRef(false);
  const modeResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs so interval callbacks always see current state
  const isProcessingRef = useRef(isProcessing);
  const isPTTHeldRef = useRef(isPTTHeld);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { isPTTHeldRef.current = isPTTHeld; }, [isPTTHeld]);

  const storeMapRef = useRef(storeMap);
  useEffect(() => { storeMapRef.current = storeMap; }, [storeMap]);

  // Always-current passive callback — avoids stale closure in setInterval
  const runPassiveRef = useRef<(() => Promise<void>) | undefined>(undefined);
  runPassiveRef.current = async () => {
    if (
      passiveInFlightRef.current ||
      isProcessingRef.current ||
      isPTTHeldRef.current
    ) return;

    let frame: string | null = null;
    try { frame = await Wearables.captureCurrentFrame(); } catch { return; }
    if (!frame) return;

    passiveInFlightRef.current = true;
    try {
      const resp = await fetch(`${BACKEND_URL}/passive_frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame }),
      });
      const data = await resp.json();

      // Always update indicator on every passive call
      setLoadType(data.updated_load_type ?? 0);
      setConfidence(data.updated_confidence ?? 0);

      if (data.intervene && data.response) {
        addCaptureMessage('assistant', data.response);
        try { Tts.speak(data.response); } catch {}
      }
    } catch {
      // silently skip failed passive frames
    } finally {
      passiveInFlightRef.current = false;
    }
  };

  // TTS init
  useEffect(() => {
    try { Tts.setDefaultLanguage('en-US'); } catch {}
    Tts.addEventListener('tts-start', () => {});
    Tts.addEventListener('tts-finish', () => {});
    Tts.addEventListener('tts-progress', () => {});
    return () => { try { Tts.stop(); } catch {} };
  }, []);

  // Voice recognition handlers
  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) {
        transcriptRef.current = e.value[0];
      }
    };
    Voice.onSpeechError = (_e: SpeechErrorEvent) => {
      setIsProcessing(false);
    };
    return () => { Voice.destroy().then(() => Voice.removeAllListeners()); };
  }, []);

  // Glasses stream state
  useEffect(() => {
    const sub = wearablesEmitter.addListener('onStreamStateChange', ({ state }) => {
      setStreamState(state as StreamState);
    });
    return () => sub.remove();
  }, []);

  // Start/stop passive polling based on stream state
  useEffect(() => {
    if (streamState === 'streaming') {
      startPassivePolling();
    } else {
      if (passiveTimerRef.current) {
        clearInterval(passiveTimerRef.current);
        passiveTimerRef.current = null;
      }
      if (modeResumeTimerRef.current) {
        clearTimeout(modeResumeTimerRef.current);
        modeResumeTimerRef.current = null;
      }
      passiveInFlightRef.current = false;
    }
    return () => {
      if (passiveTimerRef.current) {
        clearInterval(passiveTimerRef.current);
        passiveTimerRef.current = null;
      }
      if (modeResumeTimerRef.current) {
        clearTimeout(modeResumeTimerRef.current);
        modeResumeTimerRef.current = null;
      }
    };
  }, [streamState]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (captureMessages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [captureMessages.length]);

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        try {
          if (!didRegister) {
            await Wearables.startRegistration();
            didRegister = true;
          }
          if (!didGrantPermission) {
            await Wearables.requestCameraPermission();
            didGrantPermission = true;
          }
          await Wearables.startStream();
        } catch {}
      };
      init();
      return () => {
        Wearables.stopStream().catch(() => {});
        setStreamState('stopped');
        Voice.cancel().catch(() => {});
        try { Tts.stop(); } catch {}
        if (passiveTimerRef.current) {
          clearInterval(passiveTimerRef.current);
          passiveTimerRef.current = null;
        }
        if (modeResumeTimerRef.current) {
          clearTimeout(modeResumeTimerRef.current);
          modeResumeTimerRef.current = null;
        }
        passiveInFlightRef.current = false;
      };
    }, [])
  );

  const callActiveAgent = async (transcription: string) => {
    let frame: string | null = null;
    try { frame = await Wearables.captureCurrentFrame(); } catch {}

    const body: Record<string, any> = { user_message: transcription };
    if (frame) body.frame = frame;
    if (storeMapRef.current) body.store_map = storeMapRef.current;

    const resp = await fetch(`${BACKEND_URL}/active_frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await resp.json();
  };

  const stopPassivePolling = () => {
    if (passiveTimerRef.current) {
      clearInterval(passiveTimerRef.current);
      passiveTimerRef.current = null;
    }
    if (modeResumeTimerRef.current) {
      clearTimeout(modeResumeTimerRef.current);
      modeResumeTimerRef.current = null;
    }
  };

  const startPassivePolling = () => {
    if (passiveTimerRef.current) return;
    passiveTimerRef.current = setInterval(
      () => { runPassiveRef.current?.(); },
      PASSIVE_POLL_MS,
    );
    setCaptureMode('passive');
  };

  const schedulePassiveResume = () => {
    if (modeResumeTimerRef.current) clearTimeout(modeResumeTimerRef.current);
    modeResumeTimerRef.current = setTimeout(() => {
      modeResumeTimerRef.current = null;
      startPassivePolling();
    }, 20_000);
  };

  const handlePTTStart = () => {
    if (isProcessing) return;
    transcriptRef.current = '';
    isPTTHeldRef.current = true;
    setIsPTTHeld(true);
    stopPassivePolling();
    setCaptureMode('active');
    try { Tts.stop(); } catch {}
    Voice.start('en-US').catch(() => {});
  };

  const handlePTTEnd = async () => {
    if (!isPTTHeldRef.current) return;
    isPTTHeldRef.current = false;
    setIsPTTHeld(false);
    setIsProcessing(true);

    try { await Voice.stop(); } catch {}

    await new Promise<void>(r => setTimeout(r, 400));

    const transcription = transcriptRef.current.trim();
    if (!transcription) {
      setIsProcessing(false);
      schedulePassiveResume();
      return;
    }

    addCaptureMessage('user', transcription);

    try {
      const data = await callActiveAgent(transcription);
      const response: string = data.response ?? '';
      const action: string | null = data.suggested_action ?? null;

      // Always update indicator on every active call
      setLoadType(data.updated_load_type ?? 0);
      setConfidence(data.updated_confidence ?? 0);

      addCaptureMessage('assistant', response);
      try { Tts.speak(response); } catch {}

      if (action) {
        console.log('[CognitiveCart] suggested_action:', action);
      }
    } catch {
      addCaptureMessage('assistant', "Sorry, I couldn't reach the server. Please try again.");
    }

    setIsProcessing(false);
    schedulePassiveResume();
  };

  const handleFeedback = (id: string, feedback: 'up' | 'down') => {
    setCaptureFeedback(id, feedback);
    if (feedback === 'up') {
      endCaptureSession();
      try { Tts.stop(); } catch {}
    }
  };

  const glassesConnected = streamState === 'streaming';

  const LOAD_LABELS: Record<number, string> = {
    0: 'No load',
    1: 'Search',
    2: 'Comparison',
    3: 'Choice overload',
    4: 'Comprehension',
  };

  const confidenceColor = confidence >= 0.7 ? '#ef4444' : confidence >= 0.4 ? '#f59e0b' : '#22c55e';

  const pttLabel = isProcessing
    ? 'Processing...'
    : isPTTHeld
    ? 'Listening...'
    : 'Hold to talk';

  return (
    <View style={styles.container}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={styles.glassesStatus}>
          <View style={[styles.statusDot, glassesConnected && styles.statusDotConnected]} />
          <Text style={[styles.statusText, glassesConnected && styles.statusTextConnected]}>
            {glassesConnected ? 'Glasses connected' : 'Connecting...'}
          </Text>
        </View>
        <View style={styles.loadIndicator}>
          <View style={[styles.loadDot, { backgroundColor: confidenceColor }]} />
          <Text style={styles.loadLabel}>{LOAD_LABELS[loadType] ?? 'No load'}</Text>
          <Text style={styles.loadConf}>{Math.round(confidence * 100)}%</Text>
        </View>
        <Text style={styles.modeLabel}>{captureMode === 'active' ? 'Active' : 'Passive'}</Text>
      </View>

      {/* Conversation */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={false}
      >
        {captureMessages.length === 0 && (
          <Text style={styles.emptyHint}>
            Point your glasses at a shelf. The assistant will check in when it detects you need help.
          </Text>
        )}
        {captureMessages.map((msg) =>
          msg.role === 'assistant' ? (
            <AssistantBubble key={msg.id} msg={msg} onFeedback={handleFeedback} />
          ) : (
            <UserBubble key={msg.id} msg={msg} />
          )
        )}
      </ScrollView>

      <BarcodeScanScreen
        visible={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
      />

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Pressable style={styles.barcodeBtn} onPress={() => setShowBarcodeScanner(true)}>
          <Text style={styles.barcodeBtnText}>▦</Text>
        </Pressable>
        <Pressable
          style={[
            styles.pttBtn,
            isPTTHeld && styles.pttBtnActive,
            isProcessing && styles.pttBtnProcessing,
          ]}
          onPressIn={handlePTTStart}
          onPressOut={handlePTTEnd}
          disabled={isProcessing}
        >
          <Text style={[styles.pttBtnText, (isPTTHeld || isProcessing) && styles.pttBtnTextActive]}>
            {pttLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 52,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  glassesStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#444',
  },
  statusDotConnected: {
    backgroundColor: '#22c55e',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  statusTextConnected: {
    color: '#fff',
  },
  loadIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  loadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  loadLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ccc',
  },
  loadConf: {
    fontSize: 11,
    color: '#666',
  },
  modeLabel: {
    fontSize: 14,
    color: '#888',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    gap: 16,
    flexGrow: 1,
  },
  emptyHint: {
    color: '#444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  bubbleGroup: {
    gap: 8,
  },
  assistantBubbleWrap: {
    alignItems: 'flex-start',
    maxWidth: '78%',
    gap: 6,
  },
  bubbleLabel: {
    fontSize: 11,
    color: '#555',
    paddingLeft: 2,
  },
  bubbleLabelRight: {
    fontSize: 11,
    color: '#555',
    paddingRight: 2,
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubbleText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 2,
  },
  feedbackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackIcon: {
    fontSize: 17,
  },
  feedbackGiven: {
    fontSize: 17,
    paddingLeft: 4,
  },
  sessionEndRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  sessionEndLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2a2a2a',
  },
  sessionEndText: {
    fontSize: 11,
    color: '#444',
  },
  userBubbleWrap: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    maxWidth: '78%',
    gap: 6,
  },
  userBubble: {
    backgroundColor: '#2d4a7a',
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubbleText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
  },
  barcodeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  barcodeBtnText: {
    fontSize: 22,
    color: '#888',
  },
  pttBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1e3a6e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pttBtnActive: {
    backgroundColor: '#1d4ed8',
  },
  pttBtnProcessing: {
    backgroundColor: '#1e3a6e',
    opacity: 0.7,
  },
  pttBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7aa7e0',
  },
  pttBtnTextActive: {
    color: '#fff',
  },
});
