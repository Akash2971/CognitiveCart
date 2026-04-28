# CognitiveCart — AI Grocery Shopping Assistant

## Framework

**Recognize need → Suggest actions → Get feedback → Close the loop**

| Step | Description |
|------|-------------|
| Recognize need | Via chat screen (text) or push-to-talk voice input |
| Suggest actions | AI surfaces the right tool (navigation, barcode scan) at the right moment |
| Get feedback | Thumbs up / thumbs down on every AI response |

---

## Features

### 1. Chat Tab — Planning Phase

- Text-based conversation to ask questions, get recipes, and build the shopping list before going to the store
- AI clarifies dish variants and dietary restrictions before suggesting ingredients
- Ingredient proposals appear as a selectable panel (not inline text)
- Dish suggestions appear as a blocking panel the user must resolve before continuing

### 2. Capture Tab — Vision Mode (In-Store)

#### Active vs. Passive Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Passive | Default | Dwell detection running in background via frame differencing |
| Active | User presses PTT | Voice transcribed → sent to VLM with latest frame → audio response |

#### Dwell Detection ✅

- Polls every **2 seconds** while glasses are streaming
- Each frame is hashed using **dHash** (difference hash — 64-bit, brightness-invariant) via a lightweight `/dwell_check` backend endpoint (PIL only, no VLM)
- First valid frame sets the **anchor hash**; each subsequent frame is compared via **Hamming distance**
  - Hamming < 20 → same scene → score +1
  - Hamming ≥ 20 → different scene → score −0.4; builds a **candidate** anchor
  - If candidate matches 2 consecutive frames (~4s) → anchor swaps, score resets to 1
- Triggers **"Still here? Need help finding anything?"** at score ≥ 5 (~10s of dwelling)
- Score resets to 0 after trigger → re-triggers every ~10s of continued dwelling on the same shelf
- PTT press resets score → dwell clock restarts after user finishes speaking
- Dwell polling pauses during PTT holds and processing

#### Active Mode Flow

1. User presses **Hold to Talk**
2. Speech transcribed via Whisper or iOS `SFSpeechRecognizer`
3. Most recent buffered frame + transcription sent to VLM
4. AI response played back via **TTS** (`AVSpeechSynthesizer`)

#### Active ↔ Passive Transitions

- **Passive → Active**: User presses PTT
- **Active → Passive**: User presses 👍 or 20s of inactivity
- 👍 = response was helpful, action completed, return to passive
- 👎 = not satisfied, AI asks a clarifying question or tries a different approach

#### Supported Actions (in-store)

1. **Navigation** — Guide user to the right aisle using a store map loaded into context
2. **Product narrowing** — AI sees shelf from frame, asks user to scan a few specific items rather than guessing all products ("Lots of options here. Any size or brand preference, or want to scan a few?")
3. **Barcode scanning** — Scan a product barcode for nutritional facts; manual price entry field included
4. **Comparison** — Compare scanned products on price, size, nutrition

> For CL types not covered by these actions, AI responds that the request is out of scope.

---

## Cognitive Load Types Addressed

| # | Type | Reference |
|---|------|-----------|
| 1 | Search / navigation load — locating category or shelf items | — |
| 2 | Comparison load — prices, sizes, nutrition, promotions | Bettman, Luce & Payne, 1998 |
| 3 | Constraint management — budget, allergies, dietary rules | Sweller, 1988 |
| 4 | Comprehension load — interpreting labels and promotional rules | — |
| 5 | Memory load — remembering items already picked and remaining needs | — |
| 6 | Choice overload / conflict — too many similar SKUs | Iyengar & Lepper, 2000 |

---

## Additional Notes

- **Logging**: All frames and chat messages logged for research purposes
- **Scope**: Only 3 primary action types supported; anything else is explicitly out of scope

---

## UI Screens

### Chat Tab — Planning (at home)

![Chat tab](~/.claude/image-cache/a738d6d4-00ef-48cd-a004-6681e729f127/2.png)

- Greeting: "Hi! What are you shopping for today?"
- User types in the **Message...** input at the bottom; send arrow on the right
- Conversation naturally builds the shopping list (e.g. "I want to make pasta for dinner" → AI adds items, asks "Any preferences?" → "gluten-free pasta" → "Updated. Anything else?")
- Text input only — no PTT in planning mode
- Tabs: **Chat** | List | Capture

---

### List Tab — Shopping List

![List tab](~/.claude/image-cache/a738d6d4-00ef-48cd-a004-6681e729f127/5.png)

- **Header**: "Shopping list" (left) | progress counter "3 of 7" (right)
- Items are **inferred from the Chat tab only** — the AI populates the list as the user builds it through conversation
- Each item has a **checkbox**; tapping checks it off with a green tick and applies strikethrough to the name
- Unchecked items show a **subtitle** with aisle or section info (e.g. "aisle B14", "produce", "dairy") — populated from the store map after AI navigates the user
- Users can **remove items** from the list; no other manual editing
- **+ add item** button at the bottom for manual additions
- AI glasses detection / auto-detection from frames is **deferred** — not in scope for this phase
- Tabs: Chat | **List** | Capture

---

### Capture Tab — Vision Mode (in-store)

![Capture tab](~/.claude/image-cache/a738d6d4-00ef-48cd-a004-6681e729f127/3.png)
![Capture tab — active exchange](~/.claude/image-cache/a738d6d4-00ef-48cd-a004-6681e729f127/4.png)

- **Top bar**: 🟢 "Glasses connected" (left) | mode label "Passive" / "Active" (right)
- **Chat area**: shows the assistant–user exchange
  - Dwell prompt: "Need help?"
  - User transcription: "You said / which of these is cheaper?"
  - Assistant reply: "Lots of options here. Any size or brand preference, or want to scan a few?"
  - 👍 / 👎 buttons appear below every assistant response
- **Bottom bar**:
  - Barcode scan icon (left, circular) — opens barcode scanner
  - **Hold to talk** (large blue button, right) — PTT voice input
- Tabs: Chat | List | **Capture**
