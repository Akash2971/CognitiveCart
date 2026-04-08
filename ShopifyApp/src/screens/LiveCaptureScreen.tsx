import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Wearables, { wearablesEmitter } from '../../WearablesModule';
import StreamPreviewView from '../../StreamPreviewView';
import { useShoppingStore, type ItemStatus } from '../store/shoppingStore';
import type { RootTabParamList } from '../../App';

const BACKEND_URL = 'http://192.168.0.252:8000';
const CAPTURE_INTERVAL_MS = 3000;

// Module-level flags — persist across tab switches, reset on app restart
let didRegister = false;
let didGrantPermission = false;

type Nav = BottomTabNavigationProp<RootTabParamList>;

type StreamState = 'stopped' | 'waitingForDevice' | 'starting' | 'streaming' | 'paused';

const CHIP_BG: Record<ItemStatus, string> = {
  pending:   '#1c1c1c',
  detected:  '#14532d',
  not_found: '#450a0a',
};

const CHIP_BORDER: Record<ItemStatus, string> = {
  pending:   '#333',
  detected:  '#22c55e',
  not_found: '#ef4444',
};

export default function LiveCaptureScreen() {
  const navigation = useNavigation<Nav>();
  const [streamState, setStreamState] = useState<StreamState>('stopped');
  const [isCapturing, setIsCapturing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const { items, sessionId, setSessionId, updateDetection } = useShoppingStore();
  const sessionIdRef = useRef<string | null>(sessionId);
  const captureLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    const sub = wearablesEmitter.addListener('onStreamStateChange', ({ state }) => {
      setStreamState(state as StreamState);
    });
    return () => sub.remove();
  }, []);

  const stopCaptureLoop = () => {
    if (captureLoopRef.current) {
      clearInterval(captureLoopRef.current);
      captureLoopRef.current = null;
    }
    setIsCapturing(false);
  };

  const sendFrame = useCallback(async () => {
    let base64: string;
    try { base64 = await Wearables.captureCurrentFrame(); }
    catch { return; }

    const itemNames = items.map(i => i.name);
    if (itemNames.length === 0) return;

    const t0 = Date.now();
    try {
      const resp = await fetch(`${BACKEND_URL}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, items: itemNames, session_id: sessionIdRef.current }),
      });
      const data = await resp.json();
      setLastLatency(Date.now() - t0);
      setFrameCount(n => n + 1);
      setLastError(null);
      if (data.session_id) setSessionId(data.session_id);
      for (const det of data.detections) {
        updateDetection(det.item, { brand: det.brand, matched: det.matched, confidence: det.confidence, product: det.product });
      }
    } catch (e: any) {
      setLastError(e.message ?? 'Network error');
    }
  }, [items, setSessionId, updateDetection]);

  const startCaptureLoop = useCallback(() => {
    if (captureLoopRef.current) return;
    setIsCapturing(true);
    captureLoopRef.current = setInterval(sendFrame, CAPTURE_INTERVAL_MS);
  }, [sendFrame]);

  // Start/stop stream when tab is focused/unfocused
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
        } catch (e: any) {
          setLastError(e.message);
        }
      };
      init();
      return () => {
        stopCaptureLoop();
        Wearables.stopStream().catch(() => {});
        setStreamState('stopped');
        setIsCapturing(false);
      };
    }, [])
  );

  useEffect(() => {
    if (streamState === 'streaming' && !isCapturing) startCaptureLoop();
  }, [streamState, isCapturing, startCaptureLoop]);

  useEffect(() => {
    if (isCapturing) {
      stopCaptureLoop();
      captureLoopRef.current = setInterval(sendFrame, CAPTURE_INTERVAL_MS);
      setIsCapturing(true);
    }
  }, [sendFrame]);

  const handleGoToChat = () => {
    stopCaptureLoop();
    navigation.navigate('Chat');
  };

  const detectedCount = items.filter(i => i.status === 'detected').length;
  const notFoundItems = items.filter(i => i.status === 'not_found');

  return (
    <View style={styles.container}>
      {/* Camera preview */}
      <View style={styles.preview}>
        {streamState === 'streaming' ? (
          <StreamPreviewView style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.waitingBox}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.waitingText}>{streamState}</Text>
          </View>
        )}
        {/* Overlay */}
        <View style={styles.overlayRow}>
          {isCapturing && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {lastLatency !== null && (
            <Text style={styles.latencyText}>{lastLatency}ms</Text>
          )}
        </View>
      </View>

      {/* HUD */}
      <View style={styles.hud}>
        <Text style={styles.scanStatus}>
          {isCapturing
            ? `Scanning every 3s · frame ${frameCount}`
            : streamState === 'streaming' ? 'Starting scan...' : streamState}
        </Text>

        {lastError && <Text style={styles.errorText}>⚠ {lastError}</Text>}

        <Text style={styles.sectionLabel}>IDENTIFIED</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {items.map(item => (
            <View key={item.id} style={[styles.chip, { backgroundColor: CHIP_BG[item.status], borderColor: CHIP_BORDER[item.status] }]}>
              <Text style={styles.chipName}>{item.name}</Text>
              {item.detectedBrand
                ? <Text style={styles.chipBrand}>{item.detectedBrand}</Text>
                : <Text style={styles.chipStatus}>{item.status === 'pending' ? '...' : item.status}</Text>
              }
            </View>
          ))}
        </ScrollView>

        {notFoundItems.length > 0 && (
          <View style={styles.notFoundRow}>
            <Text style={styles.notFoundText}>
              ! {notFoundItems.map(i => i.name).join(', ')} — not found yet
            </Text>
          </View>
        )}

        <View style={styles.btnRow}>
          <Pressable style={styles.stopBtn} onPress={() => { stopCaptureLoop(); Wearables.stopStream().catch(() => {}); setStreamState('stopped'); }}>
            <Text style={styles.stopBtnText}>■  Stop</Text>
          </Pressable>
          <Pressable
            style={[styles.chatBtn, detectedCount === 0 && styles.chatBtnDisabled]}
            onPress={handleGoToChat}
            disabled={detectedCount === 0}
          >
            <Text style={styles.chatBtnText}>Go to chat →</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0f0f0f' },
  preview:         { flex: 1, backgroundColor: '#000', position: 'relative' },
  waitingBox:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  waitingText:     { color: '#555', fontSize: 13 },
  overlayRow: {
    position: 'absolute', top: 16, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  liveText:        { color: '#fff', fontSize: 11, fontWeight: '700' },
  latencyText: {
    color: 'rgba(255,255,255,0.6)', fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 10,
  },
  hud:             { backgroundColor: '#111', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  scanStatus:      { color: '#888', fontSize: 12, marginBottom: 10 },
  errorText:       { color: '#fca5a5', fontSize: 12, marginBottom: 8 },
  sectionLabel:    { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  chipRow:         { flexGrow: 0, marginBottom: 10 },
  chip: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginRight: 8, borderWidth: 1, minWidth: 90,
  },
  chipName:        { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  chipBrand:       { color: '#86efac', fontSize: 11, marginTop: 2 },
  chipStatus:      { color: '#888', fontSize: 11, marginTop: 2 },
  notFoundRow: {
    backgroundColor: '#2d0a0a', borderRadius: 8, padding: 10, marginBottom: 10,
  },
  notFoundText:    { color: '#fca5a5', fontSize: 12 },
  btnRow:          { flexDirection: 'row', gap: 10, paddingBottom: 12 },
  stopBtn: {
    flex: 1, height: 46, backgroundColor: '#1f2937', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  stopBtnText:     { color: '#fff', fontSize: 14, fontWeight: '600' },
  chatBtn: {
    flex: 2, height: 46, backgroundColor: '#16a34a', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  chatBtnDisabled: { backgroundColor: '#1a2e1a', opacity: 0.5 },
  chatBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
});
