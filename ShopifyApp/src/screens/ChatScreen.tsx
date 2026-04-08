import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useShoppingStore, type ChatMessage } from '../store/shoppingStore';

const BACKEND_URL = 'http://192.168.0.252:8000';

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
          {msg.content}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { items, sessionId, messages, addMessage } = useShoppingStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const detectedItems = items.filter(i => i.status === 'detected');
  const detectedCount = detectedItems.length;
  const prevCountRef = useRef(0);

  // Seed welcome message once, then notify of new products found mid-chat
  useEffect(() => {
    if (detectedCount === 0) return;
    if (messages.length === 0) {
      addMessage('assistant',
        `I found ${detectedCount} product${detectedCount > 1 ? 's' : ''} on the shelf. Ask me anything about them — nutrition, price, which to buy.`
      );
    } else if (detectedCount > prevCountRef.current && prevCountRef.current > 0) {
      addMessage('assistant', `${detectedCount - prevCountRef.current} new product(s) added to context. I now have ${detectedCount} products to help you with.`);
    }
    prevCountRef.current = detectedCount;
  }, [detectedCount]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    addMessage('user', text);
    setLoading(true);

    try {
      const allMessages = [...messages, { id: '', role: 'user' as const, content: text }];
      const resp = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId ?? 'no-session',
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await resp.json();
      addMessage('assistant', data.response);
    } catch (e: any) {
      addMessage('assistant', `Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shopping assistant</Text>
        {detectedCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{detectedCount} products identified</Text>
          </View>
        )}
      </View>

      {/* Messages */}
      {messages.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {detectedCount === 0
              ? 'Scan products first using the Capture tab, then come back to chat.'
              : 'Ask me anything about the products you found.'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MessageBubble msg={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Thinking indicator */}
      {loading && (
        <View style={styles.thinkingRow}>
          <ActivityIndicator color="#555" size="small" />
          <Text style={styles.thinkingText}>AI is thinking...</Text>
        </View>
      )}

      {/* Context chips */}
      {detectedItems.length > 0 && (
        <View style={styles.contextBox}>
          <Text style={styles.contextLabel}>CONTEXT IN THIS CHAT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {detectedItems.map(item => (
              <View key={item.id} style={styles.contextChip}>
                <Text style={styles.contextChipText}>{item.detectedBrand ?? item.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about your products..."
          placeholderTextColor="#555"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0f0f0f' },
  header:           { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, alignItems: 'center', gap: 6 },
  headerTitle:      { fontSize: 20, fontWeight: '700', color: '#fff' },
  badge:            { backgroundColor: '#1d3557', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText:        { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
  emptyBox:         { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyText:        { color: '#555', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  messageList:      { padding: 16, gap: 12 },
  bubbleRow:        { flexDirection: 'row' },
  bubbleRowUser:    { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble:           { maxWidth: '80%', borderRadius: 16, padding: 12 },
  bubbleUser:       { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 },
  bubbleAssistant:  { backgroundColor: '#1f2937', borderBottomLeftRadius: 4 },
  bubbleText:       { fontSize: 15, lineHeight: 21 },
  bubbleTextUser:   { color: '#fff' },
  bubbleTextAssistant: { color: '#e5e7eb' },
  thinkingRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  thinkingText:     { color: '#555', fontSize: 13 },
  contextBox:       { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  contextLabel:     { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  contextChip: {
    backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 12,
    paddingVertical: 5, marginRight: 8, borderWidth: 1, borderColor: '#2a2a2a',
  },
  contextChipText:  { color: '#aaa', fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a',
  },
  input: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, color: '#fff',
    fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: '#2a2a2a',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled:  { backgroundColor: '#1e3a5f', opacity: 0.5 },
  sendBtnText:      { color: '#fff', fontSize: 18, fontWeight: '700' },
});
