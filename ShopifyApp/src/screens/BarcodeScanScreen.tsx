import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Wearables, { wearablesEmitter } from '../../WearablesModule';

const BACKEND_URL = 'http://192.168.0.252:8080';

type ScanState = 'idle' | 'preview' | 'scanning' | 'success' | 'error';

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
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentProduct, setCurrentProduct] = useState<ScannedItem | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [scannedList, setScannedList] = useState<ScannedItem[]>([]);
  const photoCaptureRef = useRef<ReturnType<typeof wearablesEmitter.addListener> | null>(null);

  useEffect(() => {
    if (!visible) return;
    photoCaptureRef.current = wearablesEmitter.addListener('onPhotoCapture', ({ data }) => {
      setCapturedFrame(data);
      setScanState('preview');
    });
    return () => {
      photoCaptureRef.current?.remove();
      photoCaptureRef.current = null;
    };
  }, [visible]);

  const handleCapture = async () => {
    setIsCapturing(true);
    try { await Wearables.capturePhoto(); } catch {}
    setIsCapturing(false);
  };

  const reset = () => {
    setScanState('idle');
    setCapturedFrame(null);
    setCurrentProduct(null);
    setPriceInput('');
    setErrorMsg('');
  };

  const handleSend = async () => {
    if (!capturedFrame) return;
    setScanState('scanning');
    try {
      const resp = await fetch(`${BACKEND_URL}/scan_barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame: capturedFrame }),
      });
      const data = await resp.json();
      if (!data.success) {
        setErrorMsg(data.message ?? 'Scan failed.');
        setScanState('error');
        return;
      }
      const p = data.product;
      setCurrentProduct({ barcode: p.barcode, name: p.name, brand: p.brand, size: p.size, price: '' });
      setScanState('success');
    } catch {
      setErrorMsg("Couldn't reach the server.");
      setScanState('error');
    }
  };

  const handleSavePrice = async () => {
    if (!currentProduct) return;
    const price = parseFloat(priceInput);
    if (!isNaN(price) && price > 0) {
      try {
        await fetch(`${BACKEND_URL}/scanned_products/${currentProduct.barcode}/price`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price }),
        });
      } catch {}
    }
    setScannedList(prev => [{ ...currentProduct, price: priceInput }, ...prev]);
    reset();
  };

  const handleClose = () => {
    reset();
    setScannedList([]);
    onClose();
  };

  const glassesConnectedDot = (
    <View style={styles.glassesRow}>
      <View style={styles.greenDot} />
      <Text style={styles.glassesText}>Glasses connected</Text>
    </View>
  );

  const renderHeader = (title: string) => (
    <View style={styles.sheetHeader}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
        <Text style={styles.closeBtnText}>✕</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        {glassesConnectedDot}

        {/* IDLE */}
        {scanState === 'idle' && (
          <View style={styles.sheet}>
            {renderHeader('Scan a barcode')}
            <View style={styles.instructionBox}>
              {['Hold the product so the barcode is clearly visible', 'Look directly at the barcode', 'Press the capture button on your glasses'].map((txt, i) => (
                <View key={i} style={styles.instructionRow}>
                  <View style={styles.instructionNum}>
                    <Text style={styles.instructionNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.instructionText}>{txt}</Text>
                </View>
              ))}
            </View>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>▦</Text>
              <Text style={styles.placeholderText}>Waiting for capture...</Text>
            </View>
            <Pressable
              style={[styles.btnPrimary, isCapturing && { opacity: 0.6 }]}
              onPress={handleCapture}
              disabled={isCapturing}
            >
              <Text style={styles.btnPrimaryText}>
                {isCapturing ? 'Capturing...' : 'Capture'}
              </Text>
            </Pressable>
            <Text style={styles.hint}>Or press the capture button on your glasses</Text>
          </View>
        )}

        {/* PREVIEW */}
        {scanState === 'preview' && capturedFrame && (
          <View style={styles.sheet}>
            {renderHeader('Use this photo?')}
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${capturedFrame}` }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <View style={styles.timestamp}>
                <Text style={styles.timestampText}>just now</Text>
              </View>
            </View>
            <View style={styles.btnRow}>
              <Pressable style={styles.btnSecondary} onPress={reset}>
                <Text style={styles.btnSecondaryText}>Retake</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleSend}>
                <Text style={styles.btnPrimaryText}>Use this photo</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* SCANNING */}
        {scanState === 'scanning' && (
          <View style={styles.sheet}>
            {renderHeader('Scanning...')}
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.scanningText}>Reading barcode...</Text>
            </View>
          </View>
        )}

        {/* ERROR */}
        {scanState === 'error' && (
          <View style={styles.sheet}>
            {renderHeader('Scan failed')}
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
            <Pressable style={styles.btnPrimaryFull} onPress={reset}>
              <Text style={styles.btnPrimaryText}>Retake</Text>
            </Pressable>
          </View>
        )}

        {/* SUCCESS */}
        {scanState === 'success' && currentProduct && (
          <KeyboardAvoidingView
            style={styles.sheet}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {renderHeader(`Scanned (${scannedList.length + 1})`)}
            <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultScrollContent}>
              {/* Current product — highlighted */}
              <View style={styles.currentProductCard}>
                <View style={styles.currentProductHeader}>
                  <Text style={styles.checkmark}>✓</Text>
                  <View style={styles.currentProductInfo}>
                    <Text style={styles.currentProductName}>{currentProduct.name}</Text>
                    <Text style={styles.currentProductSub}>
                      {[currentProduct.size, `UPC ${currentProduct.barcode}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Price:</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={priceInput}
                    onChangeText={setPriceInput}
                    placeholder="$0.00"
                    placeholderTextColor="#555"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Previous scans */}
              {scannedList.map((item, i) => (
                <View key={i} style={styles.prevItem}>
                  <Text style={styles.prevCheckmark}>✓</Text>
                  <View style={styles.prevInfo}>
                    <Text style={styles.prevName}>{item.name}</Text>
                    {item.price ? <Text style={styles.prevPrice}>${item.price}</Text> : null}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.btnRow}>
              <Pressable style={styles.btnSecondary} onPress={handleClose}>
                <Text style={styles.btnSecondaryText}>Done</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleSavePrice}>
                <Text style={styles.btnPrimaryText}>Scan another</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingTop: 60,
  },
  glassesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  glassesText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
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
    color: '#888',
    fontSize: 14,
  },
  instructionBox: {
    backgroundColor: '#242424',
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  instructionNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2d4a7a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionNumText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  instructionText: {
    flex: 1,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  placeholder: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderIcon: {
    fontSize: 36,
    color: '#333',
  },
  placeholderText: {
    color: '#444',
    fontSize: 14,
  },
  hint: {
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
  },
  imageWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  timestamp: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timestampText: {
    color: '#fff',
    fontSize: 12,
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
  btnPrimaryFull: {
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  scanningText: {
    color: '#888',
    fontSize: 15,
  },
  errorText: {
    color: '#f87171',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  resultScroll: {
    flex: 1,
  },
  resultScrollContent: {
    gap: 10,
  },
  currentProductCard: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#22c55e33',
  },
  currentProductHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkmark: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  currentProductInfo: {
    flex: 1,
    gap: 4,
  },
  currentProductName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  currentProductSub: {
    color: '#888',
    fontSize: 13,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#22c55e33',
  },
  priceLabel: {
    color: '#888',
    fontSize: 14,
  },
  priceInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 4,
  },
  prevItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  prevCheckmark: {
    color: '#22c55e',
    fontSize: 14,
  },
  prevInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prevName: {
    color: '#aaa',
    fontSize: 14,
    flex: 1,
  },
  prevPrice: {
    color: '#888',
    fontSize: 14,
  },
});
