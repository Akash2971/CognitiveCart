import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BACKEND_URL } from '../config';

type ScanState = 'scanning' | 'loading' | 'error';

interface ScannedItem {
  barcode: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: number | null;
  nutriscore: string | null;
  nova: number | null;
  ingredients: string | null;
  allergens: string | null;
  labels: string | null;
  calories: number | null;
  fat: number | null;
  saturated_fat: number | null;
  carbs: number | null;
  sugars: number | null;
  fiber: number | null;
  protein: number | null;
  sodium: number | null;
}

export interface MinimalProduct {
  name: string;
  brand?: string | null;
  nutriscore?: string | null;
  nova?: number | null;
  calories?: number | null;
  fat?: number | null;
  saturated_fat?: number | null;
  sugars?: number | null;
  protein?: number | null;
  salt?: number | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  mode?: 'normal' | 'compare';
  onCompareComplete?: (products: MinimalProduct[]) => void;
}

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.65);
const HANDLE_H = 56;
const PEEK_H = 124; // handle + one full row
const SNAP_OFF = SHEET_H;
const SNAP_PEEK = SHEET_H - PEEK_H;
const SNAP_FULL = 0;

interface SessionItem { name: string; barcode: string }

function ScanSheet({ items }: { items: SessionItem[] }) {
  const sheetY = useRef(new Animated.Value(SNAP_OFF)).current;
  const sheetYVal = useRef(SNAP_OFF);
  const isExpandedRef = useRef(false);
  const dragStartY = useRef(0);

  const snapTo = (target: number, expanded: boolean) => {
    isExpandedRef.current = expanded;
    sheetYVal.current = target;
    Animated.spring(sheetY, { toValue: target, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  useEffect(() => {
    if (items.length > 0) snapTo(SNAP_PEEK, false);
  }, [items.length]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => { dragStartY.current = sheetYVal.current; },
      onPanResponderMove: (_, gs) => {
        const y = Math.max(SNAP_FULL, Math.min(SNAP_PEEK, dragStartY.current + gs.dy));
        sheetY.setValue(y);
        sheetYVal.current = y;
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.vy < -0.5 || gs.dy < -50) snapTo(SNAP_FULL, true);
        else if (gs.vy > 0.5 || gs.dy > 50) snapTo(SNAP_PEEK, false);
        else snapTo(isExpandedRef.current ? SNAP_FULL : SNAP_PEEK, isExpandedRef.current);
      },
    })
  ).current;

  if (items.length === 0) return null;

  return (
    <Animated.View style={[styles.scanSheet, { height: SHEET_H, transform: [{ translateY: sheetY }] }]}>
      {/* Handle — full-width drag target */}
      <View {...panResponder.panHandlers} style={styles.scanSheetHandle}>
        <View style={styles.scanSheetBar} />
        <Text style={styles.scanSheetCount}>{items.length} product{items.length !== 1 ? 's' : ''} scanned</Text>
      </View>
      <ScrollView scrollEnabled={isExpandedRef.current} keyboardShouldPersistTaps="handled">
        {items.map((item, i) => (
          <View key={item.barcode + i} style={styles.scanSheetRow}>
            <Text style={styles.scanSheetName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.scanSheetBarcode}>{item.barcode}</Text>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const NUTRISCORE_COLORS: Record<string, string> = {
  a: '#038141', b: '#85BB2F', c: '#FECB02', d: '#EE8100', e: '#E63312',
};

const NOVA_COLORS: Record<number, string> = {
  1: '#038141', 2: '#85BB2F', 3: '#EE8100', 4: '#E63312',
};

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function NutritionRow({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  if (value == null) return null;
  return (
    <View style={styles.nutriRow}>
      <Text style={styles.nutriLabel}>{label}</Text>
      <Text style={styles.nutriValue}>{value.toFixed(1)}{unit}</Text>
    </View>
  );
}

function DetailSheet({ item, onClose }: { item: ScannedItem; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const allergens = parseList(item.allergens);
  const labels = parseList(item.labels);

  return (
    <View style={[styles.detailSheet, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.detailHandle} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.detailHeader}>
          <View style={styles.detailTitleBlock}>
            <Text style={styles.detailName}>{item.name}</Text>
            {item.brand && <Text style={styles.detailBrand}>{item.brand}</Text>}
            {item.size && <Text style={styles.detailSize}>{item.size}</Text>}
            <Text style={styles.detailBarcode}>#{item.barcode}</Text>
          </View>
          {item.price != null && (
            <Text style={styles.detailPrice}>${item.price.toFixed(2)}</Text>
          )}
        </View>

        <View style={styles.badgeRow}>
          {item.nutriscore && item.nutriscore !== 'unknown' && (
            <View style={[styles.badge, { backgroundColor: NUTRISCORE_COLORS[item.nutriscore.toLowerCase()] ?? '#555' }]}>
              <Text style={styles.badgeText}>Nutriscore {item.nutriscore.toUpperCase()}</Text>
            </View>
          )}
          {item.nova != null && (
            <View style={[styles.badge, { backgroundColor: NOVA_COLORS[item.nova] ?? '#555' }]}>
              <Text style={styles.badgeText}>NOVA {item.nova}</Text>
            </View>
          )}
        </View>

        {(item.calories ?? item.protein ?? item.fat) != null && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Nutrition per 100g</Text>
            <View style={styles.nutriTable}>
              <NutritionRow label="Calories"      value={item.calories}      unit=" kcal" />
              <NutritionRow label="Protein"       value={item.protein}       unit="g" />
              <NutritionRow label="Fat"           value={item.fat}           unit="g" />
              <NutritionRow label="Saturated Fat" value={item.saturated_fat} unit="g" />
              <NutritionRow label="Carbs"         value={item.carbs}         unit="g" />
              <NutritionRow label="Sugars"        value={item.sugars}        unit="g" />
              <NutritionRow label="Fiber"         value={item.fiber}         unit="g" />
              <NutritionRow label="Sodium"        value={item.sodium}        unit="g" />
            </View>
          </View>
        )}

        {allergens.length > 0 && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Allergens</Text>
            <View style={styles.tagRow}>
              {allergens.map(a => (
                <View key={a} style={styles.allergenTag}>
                  <Text style={styles.allergenTagText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {labels.length > 0 && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Labels</Text>
            <View style={styles.tagRow}>
              {labels.map(l => (
                <View key={l} style={styles.labelTag}>
                  <Text style={styles.labelTagText}>{l.replace(/-/g, ' ')}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {item.ingredients && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Ingredients</Text>
            <Text style={styles.ingredientsText}>{item.ingredients}</Text>
          </View>
        )}
      </ScrollView>

      <Pressable style={styles.detailClose} onPress={onClose}>
        <Text style={styles.detailCloseText}>Close</Text>
      </Pressable>
    </View>
  );
}

function HistoryView({
  items,
  onBack,
  onSelect,
}: {
  items: ScannedItem[];
  onBack: () => void;
  onSelect: (item: ScannedItem) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.historyContainer, { paddingTop: insets.top }]}>
      <View style={styles.historyHeader}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.historyTitle}>Scanned Products</Text>
        <View style={styles.historyHeaderSpacer} />
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No scans yet</Text>
          <Text style={styles.emptySubtitle}>Go back and scan a product barcode</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 10, padding: 16, paddingBottom: insets.bottom + 16 }}>
          {items.map(item => (
            <Pressable key={item.barcode} style={styles.productCard} onPress={() => onSelect(item)}>
              <View style={styles.productTop}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.productSub}>
                    {[item.brand, item.size].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.productBarcode}>#{item.barcode}</Text>
                </View>
                <View style={styles.productRight}>
                  {item.price != null && (
                    <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
                  )}
                  {item.nutriscore && item.nutriscore !== 'unknown' && (
                    <View style={[styles.miniScore, { backgroundColor: NUTRISCORE_COLORS[item.nutriscore.toLowerCase()] ?? '#555' }]}>
                      <Text style={styles.miniScoreText}>{item.nutriscore.toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.chevron}>›</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function BarcodeScanScreen({ visible, onClose, mode = 'normal', onCompareComplete }: Props) {
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [finderY, setFinderY] = useState<number | null>(null);
  const [compareItems, setCompareItems] = useState<MinimalProduct[]>([]);
  const [currentView, setCurrentView] = useState<'camera' | 'history'>('camera');
  const [historyItems, setHistoryItems] = useState<ScannedItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ScannedItem | null>(null);
  const lockedRef = useRef(false);
  const scannedRef = useRef<Set<string>>(new Set());
  const device = useCameraDevice('back');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    lockedRef.current = false;
    scannedRef.current = new Set();
    setScanState('scanning');
    setCurrentView('camera');
    setSessionCount(0);
    setSessionItems([]);
    if (mode === 'compare') setCompareItems([]);
  }, [visible, mode]);

  const openHistory = () => {
    fetch(`${BACKEND_URL}/scanned_products`)
      .then(r => r.json())
      .then(rows => { setHistoryItems(rows); setCurrentView('history'); })
      .catch(() => {});
  };

  const handleBarcode = useCallback(async (barcode: string) => {
    if (lockedRef.current || scannedRef.current.has(barcode)) return;
    lockedRef.current = true;
    setScanState('loading');

    try {
      const resp = await fetch(`${BACKEND_URL}/lookup_barcode/${encodeURIComponent(barcode)}`);
      const data = await resp.json();
      if (!data.success) {
        setErrorMsg(data.message ?? 'Product not found.');
        setScanState('error');
        return;
      }
      const p = data.product;

      scannedRef.current.add(barcode);
      setSessionItems(prev => [{ name: p.name ?? 'Unknown', barcode }, ...prev]);
      if (mode === 'compare') {
        const minimal: MinimalProduct = {
          name: p.name, brand: p.brand, nutriscore: p.nutriscore, nova: p.nova,
          calories: p.nutrition_per_100g?.calories, fat: p.nutrition_per_100g?.fat,
          saturated_fat: p.nutrition_per_100g?.saturated_fat,
          sugars: p.nutrition_per_100g?.sugars, protein: p.nutrition_per_100g?.protein,
          salt: p.nutrition_per_100g?.salt,
        };
        setCompareItems(prev => prev.find(x => x.name === p.name) ? prev : [...prev, minimal]);
      } else {
        setSessionCount(n => n + 1);
      }
      setScanState('scanning');
      lockedRef.current = false;
    } catch {
      setErrorMsg("Couldn't reach the server.");
      setScanState('error');
    }
  }, [mode]);

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-39', 'code-128'],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && codes[0].value) handleBarcode(codes[0].value);
    },
  });

  const handleClose = () => {
    setScanState('scanning');
    lockedRef.current = false;
    onClose();
  };

  const handleCompare = () => {
    onCompareComplete?.(compareItems);
    handleClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.container}>

        {/* Camera — always mounted, active only when on camera view and scanning */}
        {device && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={currentView === 'camera' && scanState === 'scanning'}
            codeScanner={codeScanner}
          />
        )}

        {/* ── History view ──────────────────────────────────────────────────── */}
        {currentView === 'history' && (
          <HistoryView
            items={historyItems}
            onBack={() => setCurrentView('camera')}
            onSelect={setSelectedItem}
          />
        )}

        {/* ── Camera view overlays ──────────────────────────────────────────── */}
        {currentView === 'camera' && scanState === 'scanning' && (
          <View style={styles.scanOverlay}>
            {/* Top bar */}
            <View style={[styles.topBar, { top: insets.top + 12 }]}>
              <Pressable onPress={handleClose} hitSlop={12} style={styles.iconBtn}>
                <Text style={styles.iconBtnText}>✕</Text>
              </Pressable>
              <Pressable onPress={openHistory} hitSlop={12} style={styles.iconBtn}>
                <Text style={styles.iconBtnText}>☰</Text>
              </Pressable>
            </View>

            {/* Dark surround with transparent hole aligned to finder box */}
            {finderY != null && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={{ height: finderY, backgroundColor: 'rgba(0,0,0,0.62)' }} />
                <View style={{ flexDirection: 'row', height: 160 }}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' }} />
                  <View style={{ width: 260 }} />
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' }} />
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' }} />
              </View>
            )}

            {/* Finder box */}
            <View
              style={styles.finderBox}
              onLayout={e => setFinderY(e.nativeEvent.layout.y)}
            />
            <Text style={styles.hint}>
              {mode === 'compare'
                ? compareItems.length === 0 ? 'Scan first product' : `${compareItems.length} scanned — keep scanning or tap Compare`
                : 'Point camera at a barcode'}
            </Text>

            {/* Action button */}
            {mode === 'normal' && sessionCount > 0 && (
              <Pressable style={styles.actionBtn} onPress={openHistory}>
                <Text style={styles.actionBtnText}>View Info ({sessionCount})</Text>
              </Pressable>
            )}
            {mode === 'compare' && compareItems.length > 0 && (
              <Pressable style={styles.actionBtn} onPress={handleCompare}>
                <Text style={styles.actionBtnText}>
                  {compareItems.length < 2 ? 'Get Info →' : `Compare ${compareItems.length} →`}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {currentView === 'camera' && scanState === 'loading' && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Looking up product...</Text>
          </View>
        )}

        {currentView === 'camera' && scanState === 'error' && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable
              style={styles.btnPrimary}
              onPress={() => { lockedRef.current = false; setScanState('scanning'); }}
            >
              <Text style={styles.btnPrimaryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {/* Session scan sheet */}
        {currentView === 'camera' && (
          <ScanSheet items={sessionItems} />
        )}

        {/* Detail modal */}
        <Modal
          visible={selectedItem != null}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedItem(null)}
        >
          <View style={styles.detailBackdrop} pointerEvents="box-none">
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedItem(null)} />
            {selectedItem && <DetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
          </View>
        </Modal>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#000' },

  // Camera overlay
  scanOverlay:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingBottom: 80 },
  topBar: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    left: 16,
    right: 16,
  },
  iconBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  iconBtnText:    { color: '#fff', fontSize: 15 },
  finderBox:      { width: 260, height: 160, borderWidth: 2, borderColor: '#3b82f6', borderRadius: 12 },
  hint:           { color: '#fff', fontSize: 15, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
  actionBtn:      { backgroundColor: '#2d4a7a', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, position: 'absolute', bottom: PEEK_H + 16 },
  actionBtnText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  overlay:        { flex: 1, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 },
  loadingText:    { color: '#888', fontSize: 15 },
  errorText:      { color: '#f87171', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btnPrimary:     { height: 52, borderRadius: 26, backgroundColor: '#2d4a7a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Scan session sheet
  scanSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  scanSheetHandle:  { height: HANDLE_H, alignItems: 'center', justifyContent: 'center', gap: 6 },
  scanSheetBar:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3a3a3c' },
  scanSheetCount:   { color: '#6b7280', fontSize: 12 },
  scanSheetRow: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2a2a',
  },
  scanSheetName:    { color: '#fff', fontSize: 14, fontWeight: '600' },
  scanSheetBarcode: { color: '#4b5563', fontSize: 11, marginTop: 3 },

  // History view
  historyContainer: { flex: 1, backgroundColor: '#0f0f0f' },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  backBtn:              { paddingRight: 8 },
  backBtnText:          { color: '#3b82f6', fontSize: 16, fontWeight: '600' },
  historyTitle:         { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  historyHeaderSpacer:  { width: 60 },
  emptyBox:             { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle:           { color: '#fff', fontSize: 18, fontWeight: '600' },
  emptySubtitle:        { color: '#555', fontSize: 14, textAlign: 'center' },

  // Product card
  productCard:    { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14 },
  productTop:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  productInfo:    { flex: 1, gap: 2 },
  productName:    { color: '#fff', fontSize: 15, fontWeight: '600' },
  productSub:     { color: '#888', fontSize: 13 },
  productBarcode: { color: '#444', fontSize: 11, marginTop: 2 },
  productRight:   { alignItems: 'flex-end', gap: 4 },
  productPrice:   { color: '#4ade80', fontSize: 14, fontWeight: '600' },
  miniScore:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  miniScoreText:  { color: '#fff', fontSize: 11, fontWeight: '700' },
  chevron:        { color: '#555', fontSize: 20 },

  // Detail sheet
  detailBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  detailSheet: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%',
  },
  detailHandle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center', marginBottom: 16 },
  detailHeader:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  detailTitleBlock:   { flex: 1, gap: 2 },
  detailName:         { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 24 },
  detailBrand:        { color: '#9ca3af', fontSize: 14 },
  detailSize:         { color: '#6b7280', fontSize: 13 },
  detailBarcode:      { color: '#374151', fontSize: 11, marginTop: 4 },
  detailPrice:        { color: '#4ade80', fontSize: 22, fontWeight: '700', marginLeft: 16 },
  badgeRow:           { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  badge:              { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText:          { color: '#fff', fontSize: 12, fontWeight: '700' },
  detailSection:      { marginBottom: 18 },
  detailSectionTitle: { color: '#6b7280', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  nutriTable:         { gap: 6 },
  nutriRow:           { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2a2a' },
  nutriLabel:         { color: '#d1d5db', fontSize: 14 },
  nutriValue:         { color: '#fff', fontSize: 14, fontWeight: '600' },
  tagRow:             { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allergenTag:        { backgroundColor: '#450a0a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  allergenTagText:    { color: '#fca5a5', fontSize: 12, fontWeight: '500' },
  labelTag:           { backgroundColor: '#1e3a5f', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  labelTagText:       { color: '#93c5fd', fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  ingredientsText:    { color: '#9ca3af', fontSize: 13, lineHeight: 20 },
  detailClose: {
    marginTop: 12, height: 48, borderRadius: 24, backgroundColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
  },
  detailCloseText:    { color: '#fff', fontSize: 15, fontWeight: '600' },
});
