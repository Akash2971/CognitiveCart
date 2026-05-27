import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootTabParamList } from '../../App';
import Voice, { SpeechResultsEvent } from '@react-native-voice/voice';
import Tts from 'react-native-tts';
import Wearables, { wearablesEmitter } from '../../WearablesModule';
import { useShoppingStore } from '../store/shoppingStore';
import BarcodeScanScreen, { type MinimalProduct } from './BarcodeScanScreen';
import { BACKEND_URL } from '../config';

// ── Types ─────────────────────────────────────────────────────────────────── //

interface PttMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface TopProduct {
  name: string;
  brand: string | null;
  reason: string;
  score: number;
}

interface ShelfResult {
  category: string;
  spoken: string;
  recommendation: string;
  winner: string | null;
  top3: TopProduct[];
  fallback_level: number;
  detected_products: { name: string; brand: string; in_db: 'found' | 'uncertain' }[];
}

interface BarcodeResult {
  verdict: 'take' | 'skip' | 'consider';
  winner: string | null;
  reason: string;
  spoken: string;
}

interface StoreLocation {
  category: string;
  aisle: string;
  landmarks: string | null;
}

type StreamState = 'stopped' | 'waitingForDevice' | 'starting' | 'streaming' | 'paused';

let _msgId = 0;
const uid = () => `t${Date.now()}_${++_msgId}`;

const VERDICT_COLOR: Record<string, string> = {
  take: '#16a34a',
  skip: '#ef4444',
  consider: '#f59e0b',
};

const VERDICT_LABEL: Record<string, string> = {
  take: 'TAKE IT',
  skip: 'SKIP IT',
  consider: 'CONSIDER IT',
};

// ── Component ─────────────────────────────────────────────────────────────── //

export default function TripScreen() {
  const { userProfile } = useShoppingStore();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  // Trip state
  const [tripActive, setTripActive] = useState(false);
  const [tripStartTime, setTripStartTime] = useState<number | null>(null);
  const [timerDisplay, setTimerDisplay] = useState('00:00');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cognitive load tracking
  const loadsRef = useRef<{ type: string; timestamp: number }[]>([]);

  // PTT conversation
  const [pttMessages, setPttMessages] = useState<PttMessage[]>([]);
  const [isPTTHeld, setIsPTTHeld] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const transcriptRef = useRef('');
  const isPTTHeldRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // Glasses stream
  const [streamState, setStreamState] = useState<StreamState>('stopped');
  const glassesConnected = streamState === 'streaming'; // true only during photo capture
  const tripActiveRef = useRef(false);

  // Barcode scanning + result
  const [showBarcode, setShowBarcode] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeResult | null>(null);
  const [showBarcodeResult, setShowBarcodeResult] = useState(false);
  const [barcodeResultCount, setBarcodeResultCount] = useState(0);

  // Shelf scan
  const [shelfScanState, setShelfScanState] = useState<'idle' | 'scanning' | 'result' | 'error'>('idle');
  const [shelfResult, setShelfResult] = useState<ShelfResult | null>(null);

  // Location modal
  const [showLocation, setShowLocation] = useState(false);
  const [locations, setLocations] = useState<StoreLocation[]>([]);

  // Trip summary modal
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<{
    duration: string;
    loads: { type: string; count: number }[];
    barcodeScans: number;
    assistanceTaps: number;
  } | null>(null);

  // ── Glasses stream ──────────────────────────────────────────────────────── //

  useEffect(() => {
    const sub = wearablesEmitter.addListener('onStreamStateChange', ({ state }) => {
      setStreamState(state as StreamState);
    });
    return () => sub.remove();
  }, []);

  const scanCancelledRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      scanCancelledRef.current = false;
      return () => {
        Voice.cancel().catch(() => {});
        try { Tts.stop(); } catch {}
        scanCancelledRef.current = true;
        Wearables.stopStream().catch(() => {});
        setShelfScanState('idle');
        setShelfResult(null);
      };
    }, [])
  );

  // ── Voice ──────────────────────────────────────────────────────────────── //

  useEffect(() => {
    try { Tts.setDefaultLanguage('en-US'); } catch {}
    try { Tts.setIgnoreSilentSwitch('ignore'); } catch {}
    try { Tts.setDucking(true); } catch {}
    const noop = () => {};
    Tts.addEventListener('tts-start', noop);
    Tts.addEventListener('tts-progress', noop);
    Tts.addEventListener('tts-finish', noop);
    Tts.addEventListener('tts-cancel', noop);
    Voice.onSpeechStart = () => {
      if (isPTTHeldRef.current) {
        try { Tts.stop(); } catch {}
        setIsStarting(false);
        setIsPTTHeld(true);
      }
    };
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      if (e.value?.[0]) transcriptRef.current = e.value[0];
    };
    Voice.onSpeechPartialResults = (e: any) => {
      if (e.value?.[0]) transcriptRef.current = e.value[0];
    };
    Voice.onSpeechError = () => {
      if (isPTTHeldRef.current) {
        isPTTHeldRef.current = false;
        setIsStarting(false);
        setIsPTTHeld(false);
        setIsProcessing(false);
      }
    };
    return () => { Voice.destroy().catch(() => {}); };
  }, []);

  // ── Trip timer ─────────────────────────────────────────────────────────── //

  useEffect(() => {
    if (tripActive && tripStartTime) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - tripStartTime) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        setTimerDisplay(`${m}:${s}`);
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tripActive, tripStartTime]);

  // Auto-scroll PTT messages
  useEffect(() => {
    if (pttMessages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [pttMessages.length]);

  // Pulse animation while listening
  useEffect(() => {
    if (isPTTHeld) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isPTTHeld]);

  // ── Trip controls ──────────────────────────────────────────────────────── //

  const startTrip = async () => {
    loadsRef.current = [];
    setPttMessages([]);
    setBarcodeResultCount(0);
    setShelfScanState('idle');
    setShelfResult(null);
    setTripStartTime(Date.now());
    tripActiveRef.current = true;
    setTripActive(true);
    try { await Wearables.startRegistration(); } catch {}
  };

  const endTrip = () => {
    tripActiveRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);

    const elapsed = tripStartTime ? Math.floor((Date.now() - tripStartTime) / 1000) : 0;
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');

    const loadCounts: Record<string, number> = {};
    loadsRef.current.forEach(l => { loadCounts[l.type] = (loadCounts[l.type] ?? 0) + 1; });
    const loads = Object.entries(loadCounts).map(([type, count]) => ({ type, count }));

    setSummary({
      duration: `${m}:${s}`,
      loads,
      barcodeScans: barcodeResultCount,
      assistanceTaps: loads.find(l => l.type === 'Choice Overload')?.count ?? 0,
    });
    setTripActive(false);
    setShowSummary(true);
  };

  const logLoad = (type: string) => {
    loadsRef.current.push({ type, timestamp: Date.now() });
  };

  // ── PTT ────────────────────────────────────────────────────────────────── //

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setPttMessages(prev => [...prev, { id: uid(), role, content }]);
  };

  const handleMicStart = () => {
    if (isProcessing || isPTTHeldRef.current) return;
    try { Tts.stop(); } catch {}
    transcriptRef.current = '';
    isPTTHeldRef.current = true;
    setIsStarting(true);
    Voice.start('en-US')
      .catch((e: any) => {
        console.log('[MIC] Voice.start failed', e);
        isPTTHeldRef.current = false;
        setIsStarting(false);
      });
  };

  const handleMicStop = async () => {
    if (!isPTTHeldRef.current) return;
    isPTTHeldRef.current = false;
    setIsPTTHeld(false);
    setIsProcessing(true);

    await new Promise<void>(r => setTimeout(r, 1000));
    try { await Voice.stop(); } catch {}
    const text = transcriptRef.current.trim();
    Voice.cancel().catch(() => {});
    if (!text) { setIsProcessing(false); return; }

    addMessage('user', text);

    const history = pttMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    try {
      const resp = await fetch(`${BACKEND_URL}/ptt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_message: text, history }),
      });
      const data = await resp.json();
      const response: string = data.response ?? '';
      addMessage('assistant', response);
      try { Tts.speak(response); } catch {}
    } catch {
      addMessage('assistant', "Sorry, I couldn't reach the server. Please try again.");
    }

    setIsProcessing(false);
  };

  // ── Location ───────────────────────────────────────────────────────────── //

  const handleLocation = async () => {
    logLoad('Search');
    if (locations.length === 0) {
      try {
        const resp = await fetch(`${BACKEND_URL}/locations`);
        const data = await resp.json();
        setLocations(data);
      } catch {}
    }
    setShowLocation(true);
  };

  // ── Shelf Scan ─────────────────────────────────────────────────────────── //

  const handleStartAssistance = async () => {
    logLoad('Choice Overload');
    setShelfScanState('scanning');
    setShelfResult(null);

    const frames: string[] = [];
    try {
      // Subscribe before startStream so we never miss the streaming event
      const isStreaming = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { sub.remove(); resolve(false); }, 8000);
        const sub = wearablesEmitter.addListener('onStreamStateChange', ({ state }) => {
          if (state === 'streaming') {
            clearTimeout(timer);
            sub.remove();
            resolve(true);
          }
        });
        Wearables.startStream().catch(() => {
          clearTimeout(timer);
          sub.remove();
          resolve(false);
        });
      });

      if (!isStreaming || scanCancelledRef.current) throw new Error('stream not ready');

      for (let i = 0; i < 4; i++) {
        if (scanCancelledRef.current) break;
        const t0 = Date.now();
        const photo = await Promise.race<string | null>([
          Wearables.capturePhoto() as Promise<string>,
          new Promise<null>(r => setTimeout(() => r(null), 3000)),
        ]);
        if (photo) frames.push(photo);
        if (i < 3) {
          const remaining = 1000 - (Date.now() - t0);
          if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));
        }
      }
    } catch {}

    if (scanCancelledRef.current) return;
    try { await Wearables.stopStream(); } catch {}
    setStreamState('stopped');

    if (frames.length === 0) {
      setShelfScanState('error');
      return;
    }

    try {
      const resp = await fetch(`${BACKEND_URL}/shelf_scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames }),
      });
      if (scanCancelledRef.current) return;
      const data: ShelfResult = await resp.json();
      setShelfResult(data);
      setShelfScanState('result');
      if (data.spoken) { try { Tts.speak(data.spoken); } catch {} }
    } catch {
      if (!scanCancelledRef.current) setShelfScanState('error');
    }
  };

  // ── Barcode ────────────────────────────────────────────────────────────── //

  const handleBarcodeComplete = async (products: MinimalProduct[]) => {
    setShowBarcode(false);
    if (products.length === 0) return;
    logLoad(products.length === 1 ? 'Comprehension' : 'Comparison');

    try {
      const resp = await fetch(`${BACKEND_URL}/barcode_analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });
      const data: BarcodeResult = await resp.json();
      setBarcodeResult(data);
      setBarcodeResultCount(c => c + products.length);
      setShowBarcodeResult(true);
      if (data.spoken) { try { Tts.speak(data.spoken); } catch {} }
    } catch {}
  };

  // ── Pre-trip screen ────────────────────────────────────────────────────── //

  const profileEmpty = userProfile.goals.length === 0;

  if (!tripActive && !showSummary) {
    return (
      <View style={styles.container}>
        <View style={styles.preTripCenter}>
          <Text style={styles.preTripTitle}>CognitiveCart</Text>
          <Text style={styles.preTripSub}>
            {glassesConnected ? 'Glasses connected — ready to start' : 'Waiting for glasses...'}
          </Text>
          <View style={[styles.statusDot, glassesConnected && styles.statusDotGreen]} />

          {profileEmpty ? (
            <View style={styles.profileNudge}>
              <Text style={styles.profileNudgeText}>No profile set</Text>
              <Text style={styles.profileNudgeSubtext}>
                Recommendations will be generic without a profile.
              </Text>
              <Pressable style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
                <Text style={styles.profileBtnText}>Set Profile</Text>
              </Pressable>
              <Pressable style={styles.startBtnGhost} onPress={startTrip}>
                <Text style={styles.startBtnGhostText}>Continue anyway</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.profileCard}>
              <Text style={styles.profileCardLabel}>Using your saved profile</Text>
              {userProfile.goals.length > 0 && (
                <Text style={styles.profileCardItem}>Goal: {userProfile.goals[0]}</Text>
              )}
              {userProfile.restrictions.length > 0 && (
                <Text style={styles.profileCardItem}>
                  Restrictions: {userProfile.restrictions.join(', ')}
                </Text>
              )}
              {userProfile.priorities.length > 0 && (
                <Text style={styles.profileCardItem}>
                  Priorities: {userProfile.priorities.join(', ')}
                </Text>
              )}
              <Pressable style={styles.startBtn} onPress={startTrip}>
                <Text style={styles.startBtnText}>Start Trip</Text>
              </Pressable>
              <Pressable style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
                <Text style={styles.profileBtnText}>Update Profile</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ── Trip summary screen ────────────────────────────────────────────────── //

  if (showSummary && summary) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.summaryContent}>
          <Text style={styles.summaryTitle}>Trip Summary</Text>
          <Text style={styles.summaryDuration}>{summary.duration}</Text>
          <Text style={styles.summaryDurationLabel}>Total Time</Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardNum}>{summary.barcodeScans}</Text>
              <Text style={styles.summaryCardLabel}>Products Scanned</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardNum}>{summary.assistanceTaps}</Text>
              <Text style={styles.summaryCardLabel}>Shelf Assists</Text>
            </View>
          </View>

          {summary.loads.length > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summarySectionTitle}>Cognitive Loads</Text>
              {summary.loads.map(l => (
                <View key={l.type} style={styles.summaryLoadRow}>
                  <Text style={styles.summaryLoadType}>{l.type}</Text>
                  <View style={styles.summaryLoadBar}>
                    <View style={[styles.summaryLoadFill, { width: `${Math.min(l.count * 33, 100)}%` as any }]} />
                  </View>
                  <Text style={styles.summaryLoadCount}>{l.count}×</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.newTripBtn} onPress={() => { setShowSummary(false); setSummary(null); setTimerDisplay('00:00'); }}>
            <Text style={styles.newTripBtnText}>New Trip</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Active trip screen ─────────────────────────────────────────────────── //

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.tripHeader}>
        <View style={styles.tripHeaderLeft}>
          <View style={[styles.statusDot, glassesConnected && styles.statusDotGreen]} />
          <Text style={styles.tripTimer}>{timerDisplay}</Text>
        </View>
        <Text style={styles.tripTitle}>CognitiveCart</Text>
        <Pressable style={styles.endTripBtn} onPress={endTrip}>
          <Text style={styles.endTripBtnText}>End Trip</Text>
        </Pressable>
      </View>

      {/* PTT conversation */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={false}
      >
        {pttMessages.length === 0 && (
          <Text style={styles.emptyHint}>
            Hold the Talk button to ask me anything about your shopping.
          </Text>
        )}
        {pttMessages.map(msg => (
          <View
            key={msg.id}
            style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
          >
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
              {msg.content}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* 3 action buttons */}
      <View style={styles.actionRow}>
        <Pressable style={[styles.actionBtn, styles.actionBtnLocation]} onPress={handleLocation}>
          <Text style={styles.actionBtnIcon}>📍</Text>
          <Text style={styles.actionBtnLabel}>Location</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionBtnAssist]}
          onPress={handleStartAssistance}
          disabled={shelfScanState === 'scanning'}
        >
          {shelfScanState === 'scanning'
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.actionBtnIcon}>👁</Text>}
          <Text style={styles.actionBtnLabel}>Assistance</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.actionBtnBarcode]} onPress={() => setShowBarcode(true)}>
          <Text style={styles.actionBtnIcon}>▦</Text>
          <Text style={styles.actionBtnLabel}>Barcode</Text>
        </Pressable>
      </View>

      {/* Mic button */}
      <View style={styles.pttRow}>
        <Pressable
          style={[styles.pttBtn, isPTTHeld && styles.pttBtnListening, isProcessing && styles.pttBtnProcessing]}
          onPress={isPTTHeld ? handleMicStop : handleMicStart}
          disabled={isProcessing || isStarting}
        >
          {isProcessing ? (
            <View style={styles.pttBtnInner}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.pttBtnTextActive}>Processing...</Text>
            </View>
          ) : isStarting ? (
            <View style={styles.pttBtnInner}>
              <ActivityIndicator color="#7aa7e0" size="small" />
              <Text style={styles.pttBtnText}>Connecting mic...</Text>
            </View>
          ) : isPTTHeld ? (
            <View style={styles.pttBtnInner}>
              <Animated.View style={[styles.micDot, { opacity: pulseAnim }]} />
              <Text style={styles.pttBtnTextActive}>Tap to Stop</Text>
            </View>
          ) : (
            <Text style={styles.pttBtnText}>Tap to Talk</Text>
          )}
        </Pressable>
      </View>

      {/* ── Modals ── */}

      {/* Barcode scanner */}
      <BarcodeScanScreen
        visible={showBarcode}
        onClose={() => setShowBarcode(false)}
        mode="compare"
        onCompareComplete={handleBarcodeComplete}
      />

      {/* Barcode result */}
      <Modal visible={showBarcodeResult} transparent animationType="slide" onRequestClose={() => setShowBarcodeResult(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowBarcodeResult(false)}>
          <View style={styles.resultSheet}>
            {barcodeResult && (
              <>
                <View style={[styles.verdictBadge, { backgroundColor: VERDICT_COLOR[barcodeResult.verdict] ?? '#555' }]}>
                  <Text style={styles.verdictText}>{VERDICT_LABEL[barcodeResult.verdict] ?? barcodeResult.verdict.toUpperCase()}</Text>
                </View>
                {barcodeResult.winner && (
                  <Text style={styles.resultWinner}>{barcodeResult.winner}</Text>
                )}
                <Text style={styles.resultReason}>{barcodeResult.reason}</Text>
                <Pressable style={styles.resultClose} onPress={() => setShowBarcodeResult(false)}>
                  <Text style={styles.resultCloseText}>Done</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Shelf scan result */}
      <Modal
        visible={shelfScanState === 'result' || shelfScanState === 'error'}
        transparent
        animationType="slide"
        onRequestClose={() => setShelfScanState('idle')}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShelfScanState('idle')}>
          <View style={styles.resultSheet}>
            {shelfScanState === 'error' ? (
              <>
                <Text style={styles.resultErrorTitle}>Couldn't scan</Text>
                <Text style={styles.resultReason}>Make sure you're pointing the glasses at a shelf and try again.</Text>
              </>
            ) : shelfResult ? (
              <>
                <Text style={styles.shelfResultTitle}>
                  {shelfResult.fallback_level === 1
                    ? `Top picks · ${shelfResult.category.replace('_', ' ')}`
                    : shelfResult.fallback_level === 2 ? 'General Advice' : 'Could not identify shelf'}
                </Text>
                {shelfResult.top3.length > 0 ? (
                  shelfResult.top3.map((p, i) => (
                    <View key={i} style={styles.topProductCard}>
                      <View style={styles.topProductHeader}>
                        <Text style={styles.topProductRank}>#{i + 1}</Text>
                        <Text style={styles.topProductName} numberOfLines={1}>{p.brand ? `${p.brand} ` : ''}{p.name}</Text>
                        <View style={[styles.scoreBadge, p.score >= 8 ? styles.scoreHigh : p.score >= 5 ? styles.scoreMid : styles.scoreLow]}>
                          <Text style={styles.scoreBadgeText}>{p.score}/10</Text>
                        </View>
                      </View>
                      <Text style={styles.topProductReason}>{p.reason}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.resultReason}>{shelfResult.recommendation}</Text>
                )}
                {shelfResult.detected_products.length > 0 && (
                  <View style={styles.shelfDetectedList}>
                    <Text style={styles.shelfDetectedLabel}>Spotted on shelf</Text>
                    {shelfResult.detected_products.map((d, i) => (
                      <View key={i} style={styles.shelfDetectedRow}>
                        <Text style={styles.shelfDetectedName}>{d.brand} {d.name}</Text>
                        <View style={[styles.inDbBadge, d.in_db === 'found' ? styles.inDbBadgeFound : styles.inDbBadgeNot]}>
                          <Text style={styles.inDbBadgeText}>{d.in_db === 'found' ? 'In catalog' : 'May not be in catalog'}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : null}
            <Pressable style={styles.resultClose} onPress={() => setShelfScanState('idle')}>
              <Text style={styles.resultCloseText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Location modal */}
      <Modal visible={showLocation} transparent animationType="slide" onRequestClose={() => setShowLocation(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLocation(false)}>
          <View style={styles.locationSheet}>
            <Text style={styles.locationTitle}>Store Locations</Text>
            {locations.length === 0 ? (
              <Text style={styles.locationEmpty}>No locations configured.</Text>
            ) : (
              locations.map(loc => (
                <View key={loc.category} style={styles.locationRow}>
                  <Text style={styles.locationCategory}>{loc.category.replace('_', ' ')}</Text>
                  <View>
                    <Text style={styles.locationAisle}>{loc.aisle}</Text>
                    {loc.landmarks && <Text style={styles.locationLandmark}>{loc.landmarks}</Text>}
                  </View>
                </View>
              ))
            )}
            <Pressable style={styles.resultClose} onPress={() => setShowLocation(false)}>
              <Text style={styles.resultCloseText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────── //

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0f0f0f' },

  // Pre-trip
  preTripCenter:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  preTripTitle:       { fontSize: 28, fontWeight: '700', color: '#fff' },
  preTripSub:         { fontSize: 14, color: '#555', textAlign: 'center' },
  preTripHint:        { fontSize: 12, color: '#333', textAlign: 'center', marginTop: 8 },
  profileNudge: {
    backgroundColor: '#1c1408', borderWidth: 1, borderColor: '#92400e',
    borderRadius: 16, padding: 20, gap: 10, width: '100%', alignItems: 'center',
  },
  profileNudgeText:   { color: '#fbbf24', fontSize: 16, fontWeight: '700' },
  profileNudgeSubtext:{ color: '#78716c', fontSize: 13, textAlign: 'center' },
  profileCard: {
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1e3a5f',
    borderRadius: 16, padding: 20, gap: 8, width: '100%', alignItems: 'center',
  },
  profileCardLabel:   { color: '#6b7280', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  profileCardItem:    { color: '#d1d5db', fontSize: 14, textAlign: 'center' },
  startBtn:           { marginTop: 8, width: '100%', paddingVertical: 16, borderRadius: 30, backgroundColor: '#3b82f6', alignItems: 'center' },
  startBtnText:       { color: '#fff', fontSize: 17, fontWeight: '700' },
  startBtnGhost: {
    width: '100%', paddingVertical: 12, borderRadius: 30,
    borderWidth: 1, borderColor: '#333', alignItems: 'center',
  },
  startBtnGhostText:  { color: '#555', fontSize: 14, fontWeight: '600' },
  profileBtn: {
    width: '100%', paddingVertical: 12, borderRadius: 30,
    borderWidth: 1, borderColor: '#3b82f6', alignItems: 'center',
  },
  profileBtnText:     { color: '#3b82f6', fontSize: 14, fontWeight: '600' },

  // Header
  tripHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  tripHeaderLeft:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripTitle:          { fontSize: 16, fontWeight: '700', color: '#fff' },
  tripTimer:          { fontSize: 15, color: '#9ca3af', fontWeight: '600', fontVariant: ['tabular-nums'] },
  endTripBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1a1a1a' },
  endTripBtnText:     { color: '#ef4444', fontSize: 13, fontWeight: '600' },

  // Status dot
  statusDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
  statusDotGreen:     { backgroundColor: '#22c55e' },

  // Messages
  messageList:        { flex: 1 },
  messageListContent: { padding: 16, gap: 12, flexGrow: 1 },
  emptyHint:          { color: '#333', fontSize: 14, textAlign: 'center', marginTop: 32, lineHeight: 22 },
  bubble:             { maxWidth: '80%', borderRadius: 16, padding: 12 },
  bubbleUser:         { alignSelf: 'flex-end', backgroundColor: '#1d3557', borderBottomRightRadius: 4 },
  bubbleAssistant:    { alignSelf: 'flex-start', backgroundColor: '#1f2937', borderBottomLeftRadius: 4 },
  bubbleText:         { fontSize: 15, lineHeight: 21 },
  bubbleTextUser:     { color: '#93c5fd' },
  bubbleTextAssistant:{ color: '#e5e7eb' },

  // Action buttons
  actionRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  actionBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 14,
    alignItems: 'center', gap: 4,
    borderWidth: 1,
  },
  actionBtnLocation:  { backgroundColor: '#0f172a', borderColor: '#1e3a5f' },
  actionBtnAssist:    { backgroundColor: '#052e16', borderColor: '#14532d' },
  actionBtnBarcode:   { backgroundColor: '#1e1b4b', borderColor: '#312e81' },
  actionBtnIcon:      { fontSize: 20 },
  actionBtnLabel:     { color: '#9ca3af', fontSize: 11, fontWeight: '600' },

  // PTT
  pttRow: {
    paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8,
  },
  pttBtn: {
    height: 56, borderRadius: 28, backgroundColor: '#1e3a6e',
    alignItems: 'center', justifyContent: 'center',
  },
  pttBtnListening:    { backgroundColor: '#991b1b' },
  pttBtnProcessing:   { opacity: 0.6 },
  pttBtnInner:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  micDot:             { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fca5a5' },
  pttBtnText:         { color: '#7aa7e0', fontSize: 16, fontWeight: '600' },
  pttBtnTextActive:   { color: '#fff' },

  // Modals
  modalBackdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  resultSheet: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14, paddingBottom: 36,
  },
  verdictBadge:       { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  verdictText:        { color: '#fff', fontSize: 14, fontWeight: '700' },
  resultWinner:       { color: '#fff', fontSize: 18, fontWeight: '700' },
  resultReason:       { color: '#9ca3af', fontSize: 15, lineHeight: 22 },
  topProductCard:     { backgroundColor: '#222', borderRadius: 12, padding: 12, gap: 6 },
  topProductHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topProductRank:     { color: '#4b5563', fontSize: 13, fontWeight: '700', width: 20 },
  topProductName:     { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  topProductReason:   { color: '#9ca3af', fontSize: 13, lineHeight: 19 },
  scoreBadge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  scoreHigh:          { backgroundColor: '#14532d' },
  scoreMid:           { backgroundColor: '#713f12' },
  scoreLow:           { backgroundColor: '#450a0a' },
  scoreBadgeText:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  resultErrorTitle:   { color: '#f87171', fontSize: 17, fontWeight: '600' },
  resultClose: {
    marginTop: 4, height: 48, borderRadius: 24, backgroundColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
  },
  resultCloseText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
  shelfResultTitle:   { color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  shelfDetectedList:  { gap: 6, marginTop: 4 },
  shelfDetectedLabel: { color: '#4b5563', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  shelfDetectedRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  shelfDetectedName:  { color: '#9ca3af', fontSize: 13, flex: 1 },
  inDbBadge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  inDbBadgeFound:     { backgroundColor: '#052e16' },
  inDbBadgeNot:       { backgroundColor: '#1c1917' },
  inDbBadgeText:      { fontSize: 11, fontWeight: '600', color: '#6b7280' },

  // Location modal
  locationSheet: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14, paddingBottom: 36,
  },
  locationTitle:      { color: '#fff', fontSize: 18, fontWeight: '700' },
  locationEmpty:      { color: '#555', fontSize: 14 },
  locationRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  locationCategory:   { color: '#9ca3af', fontSize: 14, fontWeight: '600', textTransform: 'capitalize', flex: 1 },
  locationAisle:      { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'right' },
  locationLandmark:   { color: '#4b5563', fontSize: 12, textAlign: 'right', marginTop: 2 },

  // Summary
  summaryContent:     { padding: 24, gap: 8, alignItems: 'center' },
  summaryTitle:       { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  summaryDuration:    { fontSize: 48, fontWeight: '700', color: '#3b82f6', fontVariant: ['tabular-nums'] },
  summaryDurationLabel: { fontSize: 13, color: '#555' },
  summaryGrid:        { flexDirection: 'row', gap: 12, marginTop: 16, width: '100%' },
  summaryCard: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 4,
  },
  summaryCardNum:     { fontSize: 28, fontWeight: '700', color: '#fff' },
  summaryCardLabel:   { fontSize: 12, color: '#555', textAlign: 'center' },
  summarySection:     { width: '100%', marginTop: 16 },
  summarySectionTitle:{ color: '#9ca3af', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  summaryLoadRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  summaryLoadType:    { color: '#e5e7eb', fontSize: 13, width: 120 },
  summaryLoadBar:     { flex: 1, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  summaryLoadFill:    { height: 6, backgroundColor: '#3b82f6', borderRadius: 3 },
  summaryLoadCount:   { color: '#6b7280', fontSize: 12, width: 24, textAlign: 'right' },
  newTripBtn: {
    marginTop: 24, width: '100%', height: 52, borderRadius: 26,
    backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center',
  },
  newTripBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
});
