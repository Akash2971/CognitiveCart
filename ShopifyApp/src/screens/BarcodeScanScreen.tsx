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

const BACKEND_URL = 'http://192.168.0.252:8080';

type ScanState = 'list' | 'scanning' | 'loading' | 'error';

interface ScannedItem {
  barcode: string;
  name: string;
  brand: string | null;
  size: string | null;
  price: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function BarcodeScanScreen({ visible, onClose }: Props) {
  const [scanState, setScanState] = useState<ScanState>('list');
  const [errorMsg, setErrorMsg] = useState('');
  const [scannedList, setScannedList] = useState<ScannedItem[]>([]);
  const lockedRef = useRef(false);
  const device = useCameraDevice('back');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    setScanState('list');
    lockedRef.current = false;
    fetch(`${BACKEND_URL}/scanned_products`)
      .then(r => r.json())
      .then((rows: ScannedItem[]) => setScannedList(rows.map(r => ({ ...r, price: r.price ? String(r.price) : '' }))))
      .catch(() => {});
  }, [visible]);

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
      const item: ScannedItem = { barcode: p.barcode, name: p.name, brand: p.brand, size: p.size, price: '' };
      setScannedList(prev => {
        const exists = prev.find(x => x.barcode === item.barcode);
        return exists ? prev : [item, ...prev];
      });
      setScanState('list');
    } catch {
      setErrorMsg("Couldn't reach the server.");
      setScanState('error');
    }
  }, []);

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

  const bottomPad = insets.bottom || 24;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.container}>

        {/* Camera — only active while scanning */}
        {device && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={scanState === 'scanning'}
            codeScanner={codeScanner}
          />
        )}

        {/* SCANNING overlay */}
        {scanState === 'scanning' && (
          <View style={styles.scanOverlay}>
            <View style={[styles.scanTopBar, { top: insets.top + 12 }]}>
              <Pressable onPress={() => setScanState('list')} hitSlop={12} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.finderBox} />
            <Text style={styles.hint}>Point camera at barcode</Text>
          </View>
        )}

        {/* LOADING */}
        {scanState === 'loading' && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Looking up product...</Text>
          </View>
        )}

        {/* ERROR */}
        {scanState === 'error' && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable style={styles.btnPrimary} onPress={startScanning}>
              <Text style={styles.btnPrimaryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {/* LIST */}
        {scanState === 'list' && (
          <View style={[styles.sheet, { paddingTop: insets.top + 16 }]}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Scanned products</Text>
                {scannedList.length > 0 && (
                  <Text style={styles.headerSub}>{scannedList.length} in this session</Text>
                )}
              </View>
              <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Empty state */}
            {scannedList.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>▦</Text>
                <Text style={styles.emptyTitle}>No scans yet</Text>
                <Text style={styles.emptySubtitle}>Point your iPad camera at a product barcode to get started</Text>
              </View>
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

            {/* Bottom buttons */}
            <View style={[styles.btnRow, { paddingBottom: bottomPad }]}>
              <Pressable style={styles.btnSecondary} onPress={handleClose}>
                <Text style={styles.btnSecondaryText}>Done</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={startScanning}>
                <Text style={styles.btnPrimaryText}>
                  {scannedList.length === 0 ? 'Start scanning' : '+ Scan another'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scanOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  scanTopBar: {
    position: 'absolute',
    right: 20,
  },
  finderBox: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 12,
  },
  hint: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  overlay: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 32,
  },
  loadingText: {
    color: '#888',
    fontSize: 15,
  },
  errorText: {
    color: '#f87171',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  headerSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 14,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 40,
    color: '#333',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  productCard: {
    backgroundColor: '#242424',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  productTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productIcon: {
    fontSize: 22,
    color: '#555',
  },
  productInfo: {
    flex: 1,
    gap: 2,
  },
  productName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  productSub: {
    color: '#888',
    fontSize: 13,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  priceLabel: {
    color: '#666',
    fontSize: 13,
    width: 36,
  },
  priceInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    backgroundColor: '#2e2e2e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btnSecondary: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  btnPrimary: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2d4a7a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
