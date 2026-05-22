import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useShoppingStore, type ChatMessage } from '../store/shoppingStore';

import { BACKEND_URL } from '../config';

// --------------------------------------------------------------------------- //
// ProposalCard
// --------------------------------------------------------------------------- //

function ProposalPanel({
  msgId,
  proposals,
  alreadyAdded,
  onAdd,
  onDismiss,
}: {
  msgId: string;
  proposals: string[];
  alreadyAdded: Set<string>;
  onAdd: (msgId: string, selected: string[]) => void;
  onDismiss: (msgId: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(proposals.filter(p => !alreadyAdded.has(p.toLowerCase())))
  );

  const toggle = (item: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  };

  const count = selected.size;

  return (
    <View style={styles.suggestionPanel}>
      <Text style={styles.suggestionPanelLabel}>Suggested ingredients</Text>
      {proposals.map((item, i) => {
        const inCart = alreadyAdded.has(item.toLowerCase());
        return (
          <Pressable key={`${msgId}-${i}`} style={styles.suggestionPanelRow} onPress={() => !inCart && toggle(item)}>
            <View style={[styles.suggestionNum, inCart ? styles.suggestionNumInCart : selected.has(item) && styles.suggestionNumSelected]}>
              {inCart
                ? <Text style={styles.suggestionNumCheck}>✓</Text>
                : selected.has(item)
                  ? <Text style={styles.suggestionNumCheck}>✓</Text>
                  : <Text style={styles.suggestionNumText}>{i + 1}</Text>
              }
            </View>
            <Text style={[styles.suggestionPanelText, inCart && styles.proposalInCartText]}>{item}</Text>
            {inCart && <Text style={styles.inCartBadge}>in list</Text>}
          </Pressable>
        );
      })}
      <View style={styles.proposalActions}>
        <Pressable
          style={[styles.addBtn, count === 0 && styles.addBtnDisabled]}
          onPress={() => onAdd(msgId, [...selected])}
          disabled={count === 0}
        >
          <Text style={styles.addBtnText}>Add {count > 0 ? `${count} item${count > 1 ? 's' : ''}` : 'items'}</Text>
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={() => onDismiss(msgId)}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

// --------------------------------------------------------------------------- //
// SuggestionPanel — full-width blocking card, replaces input while active
// --------------------------------------------------------------------------- //

function SuggestionPanel({
  msgId,
  suggestions,
  onPick,
  onSkip,
  onSomethingElse,
}: {
  msgId: string;
  suggestions: string[];
  onPick: (dish: string) => void;
  onSkip: (msgId: string) => void;
  onSomethingElse: (text: string) => void;
}) {
  const [customText, setCustomText] = useState('');

  return (
    <View style={styles.suggestionPanel}>
      <Text style={styles.suggestionPanelLabel}>What would you like to make?</Text>
      {suggestions.map((dish, i) => (
        <Pressable key={dish} style={styles.suggestionPanelRow} onPress={() => onPick(dish)}>
          <View style={styles.suggestionNum}>
            <Text style={styles.suggestionNumText}>{i + 1}</Text>
          </View>
          <Text style={styles.suggestionPanelText}>{dish}</Text>
          <Text style={styles.suggestionPanelArrow}>→</Text>
        </Pressable>
      ))}
      <View style={[styles.suggestionPanelRow, styles.suggestionElseRow]}>
        <View style={[styles.suggestionNum, styles.suggestionElseNum]}>
          <Text style={styles.suggestionElseIcon}>✎</Text>
        </View>
        <TextInput
          style={styles.suggestionElseInput}
          value={customText}
          onChangeText={setCustomText}
          placeholder="Something else..."
          placeholderTextColor="#4b5563"
          returnKeyType="send"
          onSubmitEditing={() => customText.trim() && onSomethingElse(customText.trim())}
        />
        {customText.trim() ? (
          <Pressable onPress={() => onSomethingElse(customText.trim())}>
            <Text style={styles.suggestionSendBtn}>→</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => onSkip(msgId)}>
            <Text style={styles.suggestionSkipInline}>Skip</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// --------------------------------------------------------------------------- //
// MessageBubble
// --------------------------------------------------------------------------- //

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <View style={styles.messageGroup}>
      {msg.content ? (
        <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
              {msg.content}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// --------------------------------------------------------------------------- //
// ChatScreen
// --------------------------------------------------------------------------- //

export default function ChatScreen() {
  const { items, sessionId, messages, addItem, addMessage, resolveProposal, resolveSuggestion } = useShoppingStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Find the latest unresolved suggestion or proposal message (if any)
  const activeSuggestionMsg = [...messages].reverse().find(
    m => m.suggestions && m.suggestions.length > 0 && !m.suggestionResolved
  );
  const activeProposalMsg = [...messages].reverse().find(
    m => m.proposals && m.proposals.length > 0 && !m.proposalResolved
  );
  const inputBlocked = !!activeSuggestionMsg || !!activeProposalMsg;

  useEffect(() => {
    if (messages.length === 0) {
      addMessage('assistant', "Hi! What are you planning to cook or buy today? I'll help you build your list.");
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleAddProposal = (msgId: string, selected: string[]) => {
    selected.forEach(name => addItem(name));
    resolveProposal(msgId);
    const names = selected.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(', ');
    addMessage('assistant', `Added ${selected.length} item${selected.length > 1 ? 's' : ''} to your cart: ${names}.`);
  };

  const handleSkipProposal = (msgId: string) => {
    resolveProposal(msgId);
    sendMessage("I'll skip those ingredients for now");
  };

  const handlePickSuggestion = (dish: string) => {
    if (activeSuggestionMsg) resolveSuggestion(activeSuggestionMsg.id);
    // directly send the dish name as if the user typed it
    sendMessage(dish);
  };

  const handleSkipSuggestion = (msgId: string) => {
    resolveSuggestion(msgId);
  };

  const handleSomethingElse = (text: string) => {
    if (activeSuggestionMsg) resolveSuggestion(activeSuggestionMsg.id);
    sendMessage(text);
  };

  const sendMessage = async (text: string) => {
    if (!text || loading) return;

    // Collect and dismiss pending proposal cards
    const pendingProposals: string[] = [];
    const justResolvedIds = new Set<string>();
    messages.forEach(m => {
      if (m.proposals && !m.proposalResolved) {
        pendingProposals.push(...m.proposals);
        resolveProposal(m.id);
        justResolvedIds.add(m.id);
      }
    });

    // If user confirms pending proposals, add them directly
    const isConfirmation = /^(ok|okay|yes|sure|yep|yeah|add|add them|go ahead|sounds good|do it|add all)$/i.test(text.trim());
    if (pendingProposals.length > 0 && isConfirmation) {
      pendingProposals.forEach(name => addItem(name));
    }

    addMessage('user', text);
    setLoading(true);

    try {
      const confirmedList = [
        ...items.map(i => i.name),
        ...(isConfirmation ? pendingProposals : []),
      ];

      // Build history — replace suggestion/proposal messages with text summaries
      const history = [...messages, { id: '', role: 'user' as const, content: text }].map(m => {
        if (m.role === 'assistant' && m.suggestions?.length) {
          return { role: m.role, content: `[I suggested these dishes: ${m.suggestions.join(', ')}]` };
        }
        if (m.role === 'assistant' && m.proposals?.length) {
          const done = justResolvedIds.has(m.id) || m.proposalResolved;
          return {
            role: m.role,
            content: done
              ? `[I proposed these items and they were added: ${m.proposals.join(', ')}]`
              : `[I proposed these items (not yet added): ${m.proposals.join(', ')}] ${m.content}`,
          };
        }
        return { role: m.role, content: m.content };
      });

      const resp = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId ?? 'planning',
          messages: history,
          confirmed_list: confirmedList,
          pending_proposals: isConfirmation ? [] : pendingProposals,
        }),
      });

      const data = await resp.json();

      (data.auto_add ?? [])
        .map((x: any) => typeof x === 'string' ? x : x?.name ?? '')
        .filter(Boolean)
        .forEach((name: string) => addItem(name));

      const proposals: string[] = (data.proposals ?? [])
        .map((x: any) => typeof x === 'string' ? x : x?.name ?? '')
        .filter(Boolean);

      const suggestions: string[] = (data.suggestions ?? []).filter(Boolean);

      console.log('[DEBUG] backend response:', { response: data.response?.slice(0, 50), proposals, suggestions });
      addMessage('assistant', data.response ?? '', proposals.length > 0 ? proposals : undefined, suggestions.length > 0 ? suggestions : undefined);
    } catch (e: any) {
      addMessage('assistant', `Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  };

  const itemCount = items.length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CognitiveCart</Text>
        {itemCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{itemCount} item{itemCount > 1 ? 's' : ''} on list</Text>
          </View>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      />

      {loading && (
        <View style={styles.thinkingRow}>
          <ActivityIndicator color="#555" size="small" />
          <Text style={styles.thinkingText}>thinking...</Text>
        </View>
      )}

      {activeSuggestionMsg && (
        <SuggestionPanel
          msgId={activeSuggestionMsg.id}
          suggestions={activeSuggestionMsg.suggestions!}
          onPick={handlePickSuggestion}
          onSkip={handleSkipSuggestion}
          onSomethingElse={handleSomethingElse}
        />
      )}
      {!activeSuggestionMsg && activeProposalMsg && (
        <ProposalPanel
          msgId={activeProposalMsg.id}
          proposals={activeProposalMsg.proposals!}
          alreadyAdded={new Set(items.map(i => i.name))}
          onAdd={handleAddProposal}
          onDismiss={handleSkipProposal}
        />
      )}

      <View style={[styles.inputRow, inputBlocked && styles.inputRowDisabled]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={inputBlocked ? 'Respond to the options above...' : 'What do you want to cook or buy?'}
          placeholderTextColor="#555"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={!inputBlocked}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || loading || inputBlocked) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || loading || inputBlocked}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// --------------------------------------------------------------------------- //
// Styles
// --------------------------------------------------------------------------- //

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: '#0f0f0f' },
  header:                 { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center', gap: 6 },
  headerTitle:            { fontSize: 20, fontWeight: '700', color: '#fff' },
  badge:                  { backgroundColor: '#1d3557', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText:              { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
  messageList:            { padding: 16, gap: 4 },
  messageGroup:           { marginBottom: 12 },
  bubbleRow:              { flexDirection: 'row' },
  bubbleRowUser:          { justifyContent: 'flex-end' },
  bubbleRowAssistant:     { justifyContent: 'flex-start' },
  bubble:                 { maxWidth: '80%', borderRadius: 16, padding: 12 },
  bubbleUser:             { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 },
  bubbleAssistant:        { backgroundColor: '#1f2937', borderBottomLeftRadius: 4 },
  bubbleText:             { fontSize: 15, lineHeight: 21 },
  bubbleTextUser:         { color: '#fff' },
  bubbleTextAssistant:    { color: '#e5e7eb' },
  thinkingRow:            { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  thinkingText:           { color: '#555', fontSize: 13 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a',
  },
  input: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, color: '#fff',
    fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: '#2a2a2a',
  },
  sendBtn:                { width: 42, height: 42, borderRadius: 21, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled:        { backgroundColor: '#1e3a5f', opacity: 0.5 },
  sendBtnText:            { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Proposal panel actions
  proposalActions:        { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 6 },
  addBtn: {
    flex: 2, height: 40, backgroundColor: '#16a34a',
    borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  addBtnDisabled:         { opacity: 0.35 },
  addBtnText:             { color: '#fff', fontSize: 14, fontWeight: '700' },
  skipBtn:                { flex: 1, height: 40, justifyContent: 'center', alignItems: 'center' },
  skipBtnText:            { color: '#555', fontSize: 14 },

  // Suggestion panel (blocking, above input)
  suggestionPanel: {
    borderTopWidth: 1, borderTopColor: '#2a2a2a',
    backgroundColor: '#111', paddingTop: 14, paddingBottom: 4,
    paddingHorizontal: 16,
  },
  suggestionPanelLabel:   { color: '#9ca3af', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  suggestionPanelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    backgroundColor: '#1a1a1a', borderRadius: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#2a2a2a',
  },
  suggestionNum: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#333',
    justifyContent: 'center', alignItems: 'center',
  },
  suggestionNumText:      { color: '#9ca3af', fontSize: 13, fontWeight: '700' },
  suggestionNumSelected:  { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  suggestionNumInCart:    { backgroundColor: '#1d3557', borderColor: '#1d3557' },
  suggestionNumCheck:     { color: '#fff', fontSize: 13, fontWeight: '700' },
  proposalInCartText:     { color: '#6b7280' },
  inCartBadge:            { color: '#3b82f6', fontSize: 11, fontWeight: '600' },
  suggestionPanelText:    { color: '#e5e7eb', fontSize: 15, flex: 1 },
  suggestionPanelArrow:   { color: '#4b5563', fontSize: 16 },
  suggestionElseRow:      { borderColor: '#1f2937', marginTop: 2 },
  suggestionElseNum: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#333',
    justifyContent: 'center', alignItems: 'center',
  },
  suggestionElseIcon:     { color: '#6b7280', fontSize: 13 },
  suggestionElseInput:    { flex: 1, color: '#e5e7eb', fontSize: 15 },
  suggestionSendBtn:      { color: '#3b82f6', fontSize: 20, fontWeight: '700', paddingHorizontal: 4 },
  suggestionSkipInline:   { color: '#4b5563', fontSize: 14, paddingHorizontal: 4 },

  // Input row disabled state
  inputRowDisabled:       { opacity: 0.35 },
});
