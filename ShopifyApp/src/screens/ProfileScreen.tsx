import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShoppingStore } from '../store/shoppingStore';
import { BACKEND_URL } from '../config';

const GOALS = [
  'Weight Loss',
  'Muscle Gain',
  'Heart Health',
  'Balanced Diet',
  'Diabetes Management',
];

const RESTRICTIONS = [
  'Gluten-Free',
  'Dairy-Free',
  'Nut-Free',
  'Vegetarian',
  'Vegan',
];

const PRIORITIES = [
  'Low Sugar',
  'High Protein',
  'Low Fat',
  'Organic',
  'Low Sodium',
  'High Fiber',
];

const PRICE_PREFERENCES = [
  { value: 'budget',    label: 'Budget',    sub: 'Cheapest option that fits my goals' },
  { value: 'mid-range', label: 'Mid-Range', sub: 'Balance of price and quality' },
  { value: 'premium',   label: 'Premium',   sub: 'Best nutrition regardless of price' },
];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

export default function ProfileScreen() {
  const { userProfile, setUserProfile } = useShoppingStore();
  const insets = useSafeAreaInsets();

  const [goal, setGoal] = useState<string>(userProfile.goals[0] ?? '');
  const [restrictions, setRestrictions] = useState<Set<string>>(new Set(userProfile.restrictions));
  const [priorities, setPriorities] = useState<Set<string>>(new Set(userProfile.priorities));
  const [pricePreference, setPricePreference] = useState<string>(userProfile.price_preference ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsPage, setSettingsPage] = useState<null | 'menu' | 'catalog'>(null);
  const [catalogItems, setCatalogItems] = useState<{ name: string; brand: string | null; barcode: string | null; category: string }[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/user_profile`)
      .then(r => r.json())
      .then(data => {
        if (data.goals) setGoal(data.goals[0] ?? '');
        if (data.restrictions) setRestrictions(new Set(data.restrictions));
        if (data.priorities) setPriorities(new Set(data.priorities));
        if (data.price_preference) setPricePreference(data.price_preference);
        setUserProfile({
          goals: data.goals ?? [],
          restrictions: data.restrictions ?? [],
          priorities: data.priorities ?? [],
          price_preference: data.price_preference ?? '',
        });
      })
      .catch(() => {});
  }, []);

  const toggleRestriction = (item: string) => {
    setRestrictions(prev => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  };

  const togglePriority = (item: string) => {
    setPriorities(prev => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else if (next.size < 2) {
        next.add(item);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const profile = {
      goals: goal ? [goal] : [],
      restrictions: [...restrictions],
      priorities: [...priorities],
      price_preference: pricePreference,
    };
    try {
      await fetch(`${BACKEND_URL}/user_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      setUserProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const openCatalog = () => {
    setSettingsPage('catalog');
    if (catalogItems.length > 0) return;
    setCatalogLoading(true);
    fetch(`${BACKEND_URL}/catalog`)
      .then(r => r.json())
      .then(data => setCatalogItems(data))
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  };

  const CATEGORY_LABELS: Record<string, string> = {
    jam: 'Jam', cereal: 'Cereal', granola: 'Granola', pasta_sauce: 'Pasta Sauce',
  };

  const grouped = catalogItems.reduce<Record<string, typeof catalogItems>>((acc, item) => {
    const key = item.category;
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable onPress={() => setSettingsPage('menu')} hitSlop={10} style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>⚙</Text>
          </Pressable>
        </View>
        <Text style={styles.headerSub}>Used to personalize product recommendations</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        <Section title="Your Goal" subtitle="Select one" />
        <View style={styles.chipRow}>
          {GOALS.map(g => (
            <Chip key={g} label={g} selected={goal === g} onPress={() => setGoal(g === goal ? '' : g)} />
          ))}
        </View>

        <View style={styles.divider} />

        <Section title="Dietary Restrictions" />
        <View style={styles.chipRow}>
          {RESTRICTIONS.map(r => (
            <Chip key={r} label={r} selected={restrictions.has(r)} onPress={() => toggleRestriction(r)} />
          ))}
        </View>

        <View style={styles.divider} />

        <Section title="Priorities" subtitle={`Pick up to 2 · ${priorities.size}/2 selected`} />
        <View style={styles.chipRow}>
          {PRIORITIES.map(p => (
            <Chip
              key={p}
              label={p}
              selected={priorities.has(p)}
              onPress={() => togglePriority(p)}
            />
          ))}
        </View>

        <View style={styles.divider} />

        <Section title="Price Preference" subtitle="How much does price matter?" />
        <View style={styles.priceRow}>
          {PRICE_PREFERENCES.map(({ value, label, sub }) => (
            <Pressable
              key={value}
              style={[styles.priceCard, pricePreference === value && styles.priceCardSelected]}
              onPress={() => setPricePreference(pricePreference === value ? '' : value)}
            >
              <Text style={[styles.priceCardLabel, pricePreference === value && styles.priceCardLabelSelected]}>{label}</Text>
              <Text style={styles.priceCardSub}>{sub}</Text>
            </Pressable>
          ))}
        </View>

      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.saveBtn, (saving || saved) && styles.saveBtnDone]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>{saved ? 'Saved' : 'Save Profile'}</Text>
          )}
        </Pressable>
      </View>

      {/* Settings modal */}
      <Modal visible={settingsPage != null} animationType="slide" onRequestClose={() => setSettingsPage(null)}>
        <View style={[styles.catalogContainer, { paddingTop: insets.top }]}>

          {/* Header */}
          <View style={styles.catalogHeader}>
            {settingsPage === 'catalog' ? (
              <Pressable onPress={() => setSettingsPage('menu')} hitSlop={10} style={styles.backBtn}>
                <Text style={styles.backBtnText}>← Back</Text>
              </Pressable>
            ) : (
              <View style={styles.backBtn} />
            )}
            <Text style={styles.catalogTitle}>
              {settingsPage === 'catalog' ? 'Product Catalog' : 'Settings'}
            </Text>
            <Pressable onPress={() => setSettingsPage(null)} hitSlop={10} style={styles.catalogClose}>
              <Text style={styles.catalogCloseText}>✕</Text>
            </Pressable>
          </View>

          {/* Settings menu */}
          {settingsPage === 'menu' && (
            <View>
              <Pressable style={styles.settingsOption} onPress={openCatalog}>
                <Text style={styles.settingsOptionText}>Show Product Catalog</Text>
                <Text style={styles.settingsOptionChevron}>›</Text>
              </Pressable>
            </View>
          )}

          {/* Catalog list */}
          {settingsPage === 'catalog' && (
            catalogLoading ? (
              <View style={styles.catalogCenter}>
                <ActivityIndicator color="#3b82f6" size="large" />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
                {Object.entries(grouped).sort().map(([cat, items]) => (
                  <View key={cat}>
                    <Text style={styles.catalogCatHeader}>
                      {CATEGORY_LABELS[cat] ?? cat} ({items.length})
                    </Text>
                    {items.map((item, i) => (
                      <View key={i} style={styles.catalogRow}>
                        <View style={styles.catalogRowInfo}>
                          <Text style={styles.catalogName}>{item.name}</Text>
                          {item.brand && <Text style={styles.catalogBrand}>{item.brand}</Text>}
                        </View>
                        <Text style={styles.catalogBarcode}>{item.barcode ?? '—'}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f0f0f' },
  header:         { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle:    { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub:      { fontSize: 13, color: '#555', marginTop: 4 },
  settingsBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  settingsBtnText: { fontSize: 17, color: '#9ca3af' },
  scroll:         { flex: 1 },
  scrollContent:  { paddingHorizontal: 20, paddingBottom: 24 },
  sectionHeader:  { marginTop: 20, marginBottom: 12 },
  sectionTitle:   { fontSize: 15, fontWeight: '600', color: '#e5e7eb' },
  sectionSubtitle:{ fontSize: 12, color: '#555', marginTop: 2 },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#1a1a1a',
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  chipSelected:   { backgroundColor: '#1d3557', borderColor: '#3b82f6' },
  chipText:       { color: '#6b7280', fontSize: 13, fontWeight: '500' },
  chipTextSelected: { color: '#93c5fd' },
  divider:        { height: 1, backgroundColor: '#1a1a1a', marginTop: 24 },
  priceRow:       { gap: 10 },
  priceCard: {
    padding: 14, borderRadius: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  priceCardSelected: { backgroundColor: '#1d3557', borderColor: '#3b82f6' },
  priceCardLabel:    { color: '#6b7280', fontSize: 14, fontWeight: '600' },
  priceCardLabelSelected: { color: '#93c5fd' },
  priceCardSub:      { color: '#374151', fontSize: 12, marginTop: 2 },
  footer:         { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  saveBtn: {
    height: 52, borderRadius: 26, backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDone:    { backgroundColor: '#16a34a' },
  saveBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Catalog modal
  catalogContainer:   { flex: 1, backgroundColor: '#0f0f0f' },
  catalogHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  catalogTitle:       { fontSize: 18, fontWeight: '700', color: '#fff' },
  catalogClose:       { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  catalogCloseText:   { color: '#fff', fontSize: 14 },
  catalogCenter:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  catalogCatHeader: {
    fontSize: 12, fontWeight: '700', color: '#3b82f6',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  catalogRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1a1a1a',
  },
  catalogRowInfo:     { flex: 1, gap: 2 },
  catalogName:        { color: '#e5e7eb', fontSize: 14, fontWeight: '500' },
  catalogBrand:       { color: '#555', fontSize: 12 },
  catalogBarcode:     { color: '#374151', fontSize: 12, fontFamily: 'monospace', marginLeft: 12 },
  backBtn:            { width: 70 },
  backBtnText:        { color: '#3b82f6', fontSize: 15, fontWeight: '600' },
  settingsOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1a1a1a',
  },
  settingsOptionText:    { color: '#e5e7eb', fontSize: 15 },
  settingsOptionChevron: { color: '#555', fontSize: 20 },
});
