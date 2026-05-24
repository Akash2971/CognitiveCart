# CognitiveCart — Agent Architecture

## Overview

The buttons are the routing mechanism — no inter-agent dispatching needed.
Each button independently triggers its own agent. The main agent (PTT) only
handles conversation and verbally points the user to the right button.

```
PTT pressed        → Main Agent
Location tapped    → DB lookup (no AI)
Start Assistance   → Shelf Scan Agent
Barcode scanned    → Barcode Agent
```

---

## Anti-Hallucination Rules (Qwen 3 8B)

The core principle: never ask the model to recall factual data — always inject it.

1. Nutrition data comes from DB/JSON, never LLM memory — the model reasons about data you give it, not data it knows
2. Separate vision from reasoning — two calls for shelf scan: "what do you see?" then "given this data, what's best?"
3. Tight structured prompts — use labeled sections: USER PROFILE, DATA, TASK, RULES
4. Force JSON output — constrains the output space, reduces hallucination
5. Confidence gating — if detection confidence is low, skip nutrition reasoning and fall back to generic advice

---

## Main Agent (PTT)

Triggered by: PTT button press (voice only — no camera frame)
Model: Qwen 3 8B VLM
Purpose: Answer general grocery questions, direct user to the right button

No product data or vision context is injected — the model has nothing factual to hallucinate.
PTT is kept text-only for speed. Vision is handled exclusively by Start Assistance and Barcode.

### System Prompt Structure

```
ROLE: You are a grocery shopping assistant. The user is wearing smart glasses.
Keep all responses under 2 sentences. Spoken tone only.

USER PROFILE:
Goal: {goals}
Restrictions: {restrictions}

TOOLS AVAILABLE TO USER:
- Location button: shows which aisle a category is in
- Start Assistance button: scans the shelf in front of them
- Barcode button: scans a product for details

RULES:
- Only answer grocery shopping questions.
- Never make up product names, nutrition facts, or store layouts.
- If the user's question needs a button, tell them which one to tap.
- If the user asks about something visual or wants product details, tell them to tap Start Assistance or Barcode.
- For anything out of scope say: "I can only help with grocery shopping —
  use Location, Start Assistance, or Barcode for product help."
```

---

## Shelf Scan Agent

Triggered by: Start Assistance button
Model: Qwen 3 8B VLM
Purpose: Identify products on shelf, match to catalog DB, recommend best for user profile

Split into two calls to prevent hallucination.

### Call 1 — Vision only (VLM)

Input: 3-frame burst from glasses camera

```
Look at this shelf image. List every product you can see.
For each, give: brand, product name, confidence (high/medium/low).
Only include products where you can clearly read the label.
Return JSON: [{"brand": "", "name": "", "confidence": "high|medium|low"}]
```

### After Call 1

- Take high/medium confidence detections only
- Fuzzy-match against catalog DB by brand + name keywords
- Inject matched DB rows into Call 2

### Call 2 — Reasoning only (text, no image)

Input: matched catalog DB rows + user profile

```
USER PROFILE:
Goal: {goals}
Restrictions: {restrictions}

PRODUCTS FROM DATABASE (matched from shelf scan):
{matched catalog rows as JSON}

TASK: Pick the single best product for this user.

RULES:
- Choose ONLY from the products listed above.
- Base your decision on the provided nutrition data, not your own knowledge.
- If fewer than 2 products matched with high confidence, say so and give generic advice.

Return JSON: {"winner": "product name", "reason": "one sentence", "confidence": "high|medium|low"}
```

### Fallback Hierarchy

- Level 1: Shelf matches catalog category + products matched → personalized recommendation from DB
- Level 2: Shelf matches catalog category + no products matched → "I can see [category] products but labels aren't clear. Based on your profile, generally look for X"
- Level 3: Category not in catalog → pure LLM general advice (model's training knowledge, clearly labeled as general)

---

## Barcode Agent

Triggered by: Barcode button (after scanning 1 or more products)
Model: Qwen 3 8B (text only — no vision, data comes from barcode JSON)
Purpose: Analyze single product or compare multiple, verdict based on user profile

### Behavior

- 1 product scanned → break it down, highlight what's good/bad for the user's profile
- 2+ products scanned → compare all, pick the best one for the user's profile

Auto-analyze on first scan. Show "Analyze" button when 2+ products are in the list.

### System Prompt Structure

```
USER PROFILE:
Goal: {goals}
Restrictions: {restrictions}

SCANNED PRODUCTS:
{full nutrition JSON for each scanned product}

TASK: {analyze | compare and pick the best}

RULES:
- Use ONLY the nutrition data provided above. Do not use your training knowledge.
- Be specific — cite actual numbers from the data.
- End with a clear verdict: TAKE IT / SKIP IT / CONSIDER IT

Return JSON: {
  "verdict": "take|skip|consider",
  "winner": "product name or null if single product",
  "reason": "one sentence with a specific number from the data",
  "spoken": "2 sentence response for TTS"
}
```

### Data Source Priority

1. Catalog DB (if product is in the curated catalog — more reliable, complete)
2. Open Food Facts API fallback (for products outside the catalog categories)

---

## Location

Triggered by: Location button
No AI involved — direct DB lookup.

```
store_locations table: category → aisle, landmarks
```

Returns a spoken string formatted by a simple template, not an LLM call.
Cognitive load logged: Search load.

---

## Cognitive Load Tracking

Tracked by button presses, not vision analysis.

| User action       | Load logged         |
|-------------------|---------------------|
| Taps Location     | Search load         |
| Taps Start Assist | Choice overload     |
| Scans barcode     | Comparison / comprehension load |

Logged to session state. Shown in trip summary at end.

---

## Trip Summary (on End Trip)

- Cognitive loads faced (type + count)
- Number of items scanned via barcode
- Number of Start Assistance sessions
- Total trip duration
- Items added to shopping list

---

## Agent Summary Table

| Agent         | Vision call          | Reasoning call       | Data source        |
|---------------|----------------------|----------------------|--------------------|
| Main (PTT)    | None (text only)       | 1 call             | None — no facts    |
| Shelf Scan    | Call 1: detect products | Call 2: rank from DB | Catalog DB      |
| Barcode       | None                 | 1 call               | Barcode JSON / DB  |
| Location      | None                 | None                 | store_locations DB |
