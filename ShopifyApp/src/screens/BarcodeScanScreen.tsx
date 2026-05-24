import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BACKEND_URL } from '../config';

type ScanState = 'list' | 'scanning' | 'loading' | 'error';

interface ScannedItem {
  barcode: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: string;
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

export default function BarcodeScanScreen({ visible, onClose, mode = 'normal', onCompareComplete }: Props) {
  const [scanState, setScanState] = useState<ScanState>('list');
  const [errorMsg, setErrorMsg] = useState('');
  const [scannedList, setScannedList] = useState<ScannedItem[]>([]);
  const [compareItems, setCompareItems] = useState<MinimalProduct[]>([]);
  const lockedRef = useRef(false);
  const device = useCameraDevice('back');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    lockedRef.current = false;
    if (mode === 'compare') {
      setCompareItems([]);
      setScanState('scanning');
    } else {
      setScanState('list');
      fetch(`${BACKEND_URL}/scanned_products`)
        .then(r => r.json())
        .then((rows: ScannedItem[]) => setScannedList(rows.map(r => ({ ...r, price: r.price ? String(r.price) : '' }))))
        .catch(() => {});
    }
  }, [visible, mode]);

  const handleBarcode = useCallback(async (barcode: string) => {
    if (lockedRef.current) return;
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

      if (mode === 'compare') {
        const minimal: MinimalProduct = {
          name: p.name,
          brand: p.brand,
          nutriscore: p.nutriscore,
          nova: p.nova,
          calories: p.nutrition_per_100g?.calories,
          fat: p.nutrition_per_100g?.fat,
          saturated_fat: p.nutrition_per_100g?.saturated_fat,
          sugars: p.nutrition_per_100g?.sugars,
          protein: p.nutrition_per_100g?.protein,
          salt: p.nutrition_per_100g?.salt,
        };
        setCompareItems(prev => prev.find(x => x.name === p.name) ? prev : [...prev, minimal]);
        setScanState('list');
      } else {
        const item: ScannedItem = { barcode: p.barcode, name: p.name, brand: p.brand, size: p.size, price: '' };
        setScannedList(prev => {
          const exists = prev.find(x => x.barcode === item.barcode);
          return exists ? prev : [item, ...prev];
        });
        setScanState('list');
      }
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

  const handlePriceChange = (barcode: string, price: string) => {
    setScannedList(prev => prev.map(item => item.barcode === barcode ? { ...item, price } : item));
  };

  const handlePriceBlur = (barcode: string, price: string) => {
    const val = parseFloat(price);
    if (!isNaN(val) && val > 0) {
      fetch(`${BACKEND_URL}/scanned_products/${barcode}/price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: val }),
      }).catch(() => {});
    }
  };

  const handleClose = () => {
    setScanState('list');
    lockedRef.current = false;
    onClose();
  };

  const startScanning = () => {
    lockedRef.current = false;
    setScanState('scanning');
  };

  const handleCompare = () => {
    onCompareComplete?.(compareItems);
    handleClose();
  };

  const bottomPad = insets.bottom || 24;
  const isCompare = mode === 'compare';
  const listData = isCompare ? compareItems : scannedList;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.container}>

        {device && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={scanState === 'scanning'}
            codeScanner={codeScanner}
          />
        )}

        {scanState === 'scanning' && (
          <View style={styles.scanOverlay}>
            <View style={[styles.scanTopBar, { top: insets.top + 12 }]}>
              <Pressable onPress={() => isCompare && compareItems.length > 0 ? setScanState('list') : handleClose()} hitSlop={12} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.finderBox} />
            <Text style={styles.hint}>
              {isCompare
                ? compareItems.length === 0
                  ? 'Scan first product'
                  : `${compareItems.length} scanned — scan another or press Done`
                : 'Point camera at barcode'}
            </Text>
            {isCompare && compareItems.length > 0 && (
              <Pressable style={styles.doneBanner} onPress={() => setScanState('list')}>
                <Text style={styles.doneBannerText}>Review & Compare →</Text>
              </Pressable>
            )}
          </View>
        )}

        {scanState === 'loading' && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Looking up product...</Text>
          </View>
        )}

        {scanState === 'error' && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable style={styles.btnPrimary} onPress={startScanning}>
              <Text style={styles.btnPrimaryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {scanState === 'list' && (
          <View style={[styles.sheet, { paddingTop: insets.top + 16 }]}>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>
                  {isCompare ? 'Products to compare' : 'Scanned products'}
                </Text>
                {listData.length > 0 && (
                  <Text style={styles.headerSub}>{listData.length} scanned</Text>
                )}
              </View>
              <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {listData.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>▦</Text>
                <Text style={styles.emptyTitle}>No scans yet</Text>
                <Text style={styles.emptySubtitle}>
                  {isCompare ? 'Scan the products you want to compare' : 'Point your camera at a product barcode to get started'}
                </Text>
              </View>
            ) : isCompare ? (
              <ScrollView style={styles.list} contentContainerStyle={{ gap: 10 }}>
                {compareItems.map((item, i) => (
                  <View key={i} style={styles.productCard}>
                    <View style={styles.productTop}>
                      <Text style={styles.productIcon}>▦</Text>
                      <View style={styles.productInfo}>
                        <Text style={styles.productName}>{item.name}</Text>
                        <Text style={styles.productSub}>
                          {[item.brand, item.nutriscore ? `Nutriscore ${item.nutriscore.toUpperCase()}` : null].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <ScrollView style={styles.list} contentContainerStyle={{ gap: 10 }}>
                {scannedList.map(item => (
                  <View key={item.barcode} style={styles.productCard}>
                    <View style={styles.productTop}>
                      <Text style={styles.productIcon}>▦</Text>
                      <View style={styles.productInfo}>
                        <Text style={styles.productName}>{item.name}</Text>
                        <Text style={styles.productSub}>
                          {[item.size, item.brand].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Price</Text>
                      <TextInput
                        style={styles.priceInput}
                        value={item.price}
                        onChangeText={v => handlePriceChange(item.barcode, v)}
                        onBlur={() => handlePriceBlur(item.barcode, item.price)}
                        placeholder="$0.00"
                        placeholderTextColor="#555"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={[styles.btnRow, { paddingBottom: bottomPad }]}>
              {isCompare ? (
                <>
                  <Pressable style={styles.btnSecondary} onPress={startScanning}>
                    <Text style={styles.btnSecondaryText}>+ Scan another</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btnPrimary, compareItems.length === 0 && styles.btnDisabled]}
                    onPress={handleCompare}
                    disabled={compareItems.length === 0}
                  >
                    <Text style={styles.btnPrimaryText}>
                      {compareItems.length < 2 ? 'Get info' : `Compare ${compareItems.length}`}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={styles.btnSecondary} onPress={handleClose}>
                    <Text style={styles.btnSecondaryText}>Done</Text>
                  </Pressable>
                  <Pressable style={styles.btnPrimary} onPress={startScanning}>
                    <Text style={styles.btnPrimaryText}>
                      {scannedList.length === 0 ? 'Start scanning' : '+ Scan another'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  scanTopBar: { position: 'absolute', right: 20 },
  finderBox: { width: 260, height: 160, borderWidth: 2, borderColor: '#3b82f6', borderRadius: 12 },
  hint: { color: '#fff', fontSize: 15, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
  doneBanner: {
    backgroundColor: '#2d4a7a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  doneBannerText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  overlay: { flex: 1, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 },
  loadingText: { color: '#888', fontSize: 15 },
  errorText: { color: '#f87171', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  sheet: { flex: 1, backgroundColor: '#1a1a1a', paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 14 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40, color: '#333', marginBottom: 4 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  emptySubtitle: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list: { flex: 1 },
  productCard: { backgroundColor: '#242424', borderRadius: 12, padding: 14, gap: 10 },
  productTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  productIcon: { fontSize: 22, color: '#555' },
  productInfo: { flex: 1, gap: 2 },
  productName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  productSub: { color: '#888', fontSize: 13 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#333', paddingTop: 10 },
  priceLabel: { color: '#666', fontSize: 13, width: 36 },
  priceInput: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500', backgroundColor: '#2e2e2e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  btnRow: { flexDirection: 'row', gap: 12 },
  btnSecondary: { flex: 1, height: 52, borderRadius: 26, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnPrimary: { flex: 1, height: 52, borderRadius: 26, backgroundColor: '#2d4a7a', alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
});
