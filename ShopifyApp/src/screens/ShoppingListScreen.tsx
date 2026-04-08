import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useShoppingStore, type ItemStatus, type ShoppingItem } from '../store/shoppingStore';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootTabParamList } from '../../App';

type Nav = BottomTabNavigationProp<RootTabParamList>;

const STATUS_COLOR: Record<ItemStatus, string> = {
  pending:   '#3a3a3a',
  detected:  '#14532d',
  not_found: '#450a0a',
};

const STATUS_BORDER: Record<ItemStatus, string> = {
  pending:   '#555',
  detected:  '#22c55e',
  not_found: '#ef4444',
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending:   'pending',
  detected:  'identified',
  not_found: 'not found',
};

function ItemRow({ item }: { item: ShoppingItem }) {
  const removeItem = useShoppingStore((s) => s.removeItem);
  return (
    <View style={[styles.row, { backgroundColor: STATUS_COLOR[item.status], borderLeftColor: STATUS_BORDER[item.status] }]}>
      <View style={styles.rowLeft}>
        <Text style={styles.itemName}>{item.name}</Text>
        {item.detectedBrand ? (
          <Text style={styles.itemSub}>{item.detectedBrand}</Text>
        ) : (
          <Text style={styles.itemSub}>{STATUS_LABEL[item.status]}</Text>
        )}
      </View>
      <Pressable onPress={() => removeItem(item.id)} hitSlop={12}>
        <Text style={styles.removeText}>✕</Text>
      </Pressable>
    </View>
  );
}

export default function ShoppingListScreen() {
  const [input, setInput] = useState('');
  const { items, addItem, resetDetections } = useShoppingStore();
  const navigation = useNavigation<Nav>();

  const detected  = items.filter(i => i.status === 'detected').length;
  const pending   = items.filter(i => i.status === 'pending').length;
  const notFound  = items.filter(i => i.status === 'not_found').length;

  const handleAdd = () => {
    if (input.trim()) { addItem(input.trim()); setInput(''); }
  };

  const handleStartCapture = () => {
    resetDetections();
    navigation.navigate('Capture');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shopping list</Text>

      {items.length > 0 && (
        <Text style={styles.summary}>
          {items.length} items
          {detected > 0 ? ` · ${detected} identified` : ''}
          {pending > 0 && detected > 0 ? ` · ${pending} pending` : ''}
          {notFound > 0 ? ` · ${notFound} not found` : ''}
        </Text>
      )}

      {items.length === 0 ? (
        <Text style={styles.empty}>Add items to start scanning.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <ItemRow item={item} />}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={styles.bottom}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleAdd}
            placeholder="Add item..."
            placeholderTextColor="#555"
            returnKeyType="done"
            autoCapitalize="none"
          />
          <Pressable style={styles.addBtn} onPress={handleAdd}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {items.length > 0 && (
          <Pressable style={styles.startBtn} onPress={handleStartCapture}>
            <Text style={styles.startBtnText}>▶  Start capture</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 16, paddingTop: 60 },
  title:        { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 4 },
  summary:      { fontSize: 13, color: '#888', marginBottom: 16 },
  empty:        { color: '#444', fontSize: 15, textAlign: 'center', marginTop: 80 },
  list:         { flex: 1 },
  listContent:  { gap: 8, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
  },
  rowLeft:      { flex: 1 },
  itemName:     { fontSize: 16, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  itemSub:      { fontSize: 13, color: '#888', marginTop: 2 },
  removeText:   { color: '#555', fontSize: 14, paddingLeft: 12 },
  bottom:       { paddingVertical: 12, gap: 10 },
  inputRow:     { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, height: 46, backgroundColor: '#1a1a1a', borderRadius: 12,
    paddingHorizontal: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a',
  },
  addBtn: {
    height: 46, paddingHorizontal: 20, backgroundColor: '#3b82f6',
    borderRadius: 12, justifyContent: 'center',
  },
  addBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  startBtn: {
    height: 52, backgroundColor: '#3b82f6', borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
