import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useShoppingStore, type ShoppingItem } from '../store/shoppingStore';

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <Text style={styles.checkmark}>✓</Text>}
    </View>
  );
}

function ItemRow({ item }: { item: ShoppingItem }) {
  const { removeItem, toggleCheck } = useShoppingStore();
  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={() => toggleCheck(item.id)}>
        <Checkbox checked={!!item.checked} />
        <View style={styles.rowContent}>
          <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
            {item.name}
          </Text>
          {item.section ? (
            <Text style={styles.itemSection}>{item.section}</Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable onPress={() => removeItem(item.id)} hitSlop={12} style={styles.removeBtn}>
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
    </View>
  );
}

import { BACKEND_URL } from '../config';

export default function ShoppingListScreen() {
  const { items, addItem, storeMap, setStoreMap, mapParsed, setMapParsed } = useShoppingStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState('');
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapUploading, setMapUploading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const checkedCount = items.filter((i) => i.checked).length;

  const handleUploadMap = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.5, includeBase64: true, maxWidth: 1024, maxHeight: 1024 }, async (response) => {
      const base64 = response.assets?.[0]?.base64;
      if (!base64) return;

      setStoreMap(base64);         // store for preview
      setMapParsed(false);
      setMapError(null);
      setMapUploading(true);

      try {
        const res = await fetch(`${BACKEND_URL}/store_map`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });
        const data = await res.json();
        if (data.success) {
          setMapParsed(true);
        } else {
          setMapError(data.message ?? 'Failed to parse map.');
        }
      } catch {
        setMapError('Could not reach the server.');
      } finally {
        setMapUploading(false);
      }
    });
  };

  const handleAdd = () => {
    if (addText.trim()) {
      addItem(addText.trim());
      setAddText('');
    }
    setShowAdd(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shopping list</Text>
        <View style={styles.headerRight}>
          {items.length > 0 && (
            <Text style={styles.counter}>{checkedCount} of {items.length}</Text>
          )}
          <Pressable onPress={() => setShowMapModal(true)} hitSlop={12} style={styles.mapBtn}>
            <Text style={styles.mapBtnText}>🗺</Text>
            {mapParsed && <View style={styles.mapDot} />}
          </Pressable>
        </View>
      </View>

      <Modal visible={showMapModal} transparent animationType="slide" onRequestClose={() => setShowMapModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowMapModal(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Store Map</Text>
            {storeMap ? (
              <>
                <Image source={{ uri: `data:image/jpeg;base64,${storeMap}` }} style={styles.mapPreview} resizeMode="contain" />
                {mapUploading && <Text style={styles.modalHint}>Parsing map...</Text>}
                {mapParsed && !mapUploading && <Text style={[styles.modalHint, { color: '#22c55e' }]}>Map ready — navigation enabled</Text>}
                {mapError && <Text style={[styles.modalHint, { color: '#ef4444' }]}>{mapError}</Text>}
                <Pressable style={styles.modalBtn} onPress={handleUploadMap} disabled={mapUploading}>
                  <Text style={styles.modalBtnText}>Replace map</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalHint}>
                  Upload a photo of the store map to enable aisle navigation.
                </Text>
                <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleUploadMap} disabled={mapUploading}>
                  <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
                    {mapUploading ? 'Parsing...' : 'Upload store map'}
                  </Text>
                </Pressable>
              </>
            )}
            <Pressable style={[styles.modalBtn, { marginTop: 8 }]} onPress={() => setShowMapModal(false)}>
              <Text style={styles.modalBtnText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Your list is empty</Text>
          <Text style={styles.emptyText}>
            Chat with the assistant to build your shopping list.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <ItemRow item={item} />}
          style={styles.list}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={styles.footer}>
        {showAdd ? (
          <View style={styles.addInputRow}>
            <TextInput
              style={styles.addInput}
              value={addText}
              onChangeText={setAddText}
              placeholder="Item name..."
              placeholderTextColor="#555"
              autoFocus
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            <Pressable onPress={handleAdd} style={styles.addConfirm}>
              <Text style={styles.addConfirmText}>Add</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.addButton} onPress={() => setShowAdd(true)}>
            <Text style={styles.addButtonText}>+ add item</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counter: {
    fontSize: 14,
    color: '#888',
  },
  mapBtn: {
    position: 'relative',
    padding: 4,
  },
  mapBtnText: {
    fontSize: 20,
  },
  mapDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#111',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  mapPreview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
  },
  modalBtn: {
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  modalBtnText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  modalBtnTextPrimary: {
    color: '#fff',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2a2a2a',
    marginLeft: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 16,
  },
  removeBtn: {
    paddingLeft: 8,
  },
  removeText: {
    color: '#444',
    fontSize: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  rowContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    color: '#fff',
    textTransform: 'capitalize',
  },
  itemNameChecked: {
    color: '#555',
    textDecorationLine: 'line-through',
  },
  itemSection: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  addButton: {
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#888',
    fontSize: 15,
  },
  addInputRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  addInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
  },
  addConfirm: {
    paddingHorizontal: 18,
    justifyContent: 'center',
    backgroundColor: '#22c55e',
  },
  addConfirmText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
