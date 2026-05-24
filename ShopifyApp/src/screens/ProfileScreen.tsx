import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/user_profile`)
      .then(r => r.json())
      .then(data => {
        if (data.goals) setGoal(data.goals[0] ?? '');
        if (data.restrictions) setRestrictions(new Set(data.restrictions));
        if (data.priorities) setPriorities(new Set(data.priorities));
        setUserProfile({
          goals: data.goals ?? [],
          restrictions: data.restrictions ?? [],
          priorities: data.priorities ?? [],
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f0f0f' },
  header:         { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle:    { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub:      { fontSize: 13, color: '#555', marginTop: 4 },
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
  footer:         { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  saveBtn: {
    height: 52, borderRadius: 26, backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDone:    { backgroundColor: '#16a34a' },
  saveBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
});
