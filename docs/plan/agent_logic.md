# CognitiveCart — Agent Logic

## Two Modes

| Mode | Trigger | Who speaks first |
|------|---------|-----------------|
| Passive | Default, always running | Agent (proactive intervention) |
| Active | User presses PTT | User |

**Passive → Active**: User presses PTT  
**Active → Passive**: User presses 👍 or 20s of inactivity  

---

## Visual Summary — Shared Persistent Context

A rolling text description of what the user has been doing, maintained by the backend. It is the bridge between passive observation and active conversation.

- Updated every 3s from passive frames
- Also updated from the active frame captured on PTT release
- Persists across session boundaries (👍 press does not clear it)
- Resets only on app restart
- Capped at ~200 words — older observations summarised or dropped

**Example evolution:**
```
t=0s:  ""
t=3s:  "User is in the cereal aisle, looking at the top shelf."
t=6s:  "User still in cereal aisle, scanning across multiple boxes."
t=12s: "User in cereal aisle 12s+, many similar SKUs visible, no selection made."
t=PTT: "User picked up a box and is reading the back label."
```

The summary is passed into every VLM call — passive and active — so the agent always knows what has been happening, not just the current frame.

---

## Context Structure

Every VLM call receives:

| Context | Always | Optional |
|---------|--------|----------|
| Current frame | ✓ | |
| Visual summary | ✓ | |
| Conversation history (last 6 turns, text only) | ✓ | |
| User profile (dietary, allergens, preferences, budget) | ✓ | |
| Scan results | | ✓ — included when scan was just completed |
| Store map | | ✓ — included when navigate tool is relevant |

Frames are never included in history — too expensive. Only text.

---

## Passive Mode — Proactive Intervention

Every 3s, backend receives current frame + updated summary. Single VLM call decides:
- Does the user need help right now?
- If yes — what load type, what message?

**The VLM only intervenes if it is confident.** Ambiguous frames produce no output. No scoring, no threshold counting — the model decides directly.

### Signals the VLM looks for

| Signal | What it sees in frame | Confidence requirement |
|--------|----------------------|----------------------|
| 1 — Search | Aisle signs visible, wide store view, no shelf in focus | One clear frame enough |
| 2 — Comparison | 2+ similar products, user examining them; scanned list has items | Moderate dwell + frame |
| 4 — Comprehension | Nutrition table or ingredient list filling most of the frame | One clear frame enough |
| 6 — Choice overload | Many similar SKUs filling shelf, summary shows 10s+ in same spot | Dwell + frame together |

### Intervention message style
Always a question or offer — never a statement. User must respond via PTT to proceed.

### After intervention
Passive polling pauses. App enters active mode. Agent waits for PTT response.

---

## Active Mode — Tool Use Loop

PTT → transcription → VLM → response. The agent does not jump to a tool immediately.

### Step 1 — Clarify
Agent asks 1-2 clarifying questions until it understands the load type and the right action. No buttons shown during clarification. User responds via PTT.

### Step 2 — Propose tool
Once confident, agent proposes: *"I think you need X — want me to do that?"*  
- 👎 shown — press to reject, agent continues clarifying  
- PTT "yes" — confirms, tool executes  

### Step 3 — Execute tool
Tool runs. Result automatically injected back into context as a new turn. Agent is called again with the tool result.

### Step 4 — Final answer
Agent responds with a definitive answer based on the tool result.  
- 👍 + 👎 shown  
- 👍 → session ends, passive resumes, summary kept  
- 👎 → agent re-enters clarifying mode, proposes different action  

### Message type → buttons shown

| Message type | Condition | Buttons |
|---|---|---|
| Clarifying | `tool=null` | None |
| Tool proposal | `tool=X`, no tool result yet | 👎 only |
| Action complete | Tool result fed back, agent answers | 👍 + 👎 |

---

## The Single Tool — Scan

Types 2, 3, and 6 all use **scan** as their action. The LLM decides how to use the result based on the question — comparison, constraint check, or comprehension. The app just opens the scanner and feeds the result back.

For **navigate** (Type 1): store map is included in context, agent gives directions directly.  
For **answer**: no tool needed, agent responds from training knowledge in one sentence.

### Scan result chips
After each scan, a small chip appears in the conversation showing the product name. Makes it visible what data the agent has. Up to 5 products can be scanned in one session.

### Scan result injection format
```
[SCAN RESULT] Product: Barilla Spaghetti | Allergens: wheat | Protein: 7g/100g | Price: $1.89
```
Appended to conversation history as a system turn. Agent sees it in the next call.

---

## How Each Tool Reduces Load

| Tool | Load type | Mechanism |
|------|-----------|-----------|
| `navigate` | 1 — Search | Offloads spatial search — user stops scanning the store, gets one instruction |
| `scan` (constraint check) | 3 — Constraint | Offloads label reading + compliance matching — user never has to read an ingredient list |
| `scan` (comparison) | 2 — Comparison | Provides the data for comparison — feeds into compare verdict |
| `scan` (comprehension) | 4 — Comprehension | Offloads label interpretation — agent translates nutrition into plain language |
| `compare` (post-scan) | 2 — Comparison | Offloads multi-attribute comparison from working memory — agent gives one ranked verdict |
| `narrow` | 6 — Choice overload | Converts overwhelming shelf into a guided 1-2 question decision tree |
| `answer` | 3B — Constraint (no product) | Converts knowledge gap into specific target — "scan X" gives user something to act on |

**Scan is the data gateway.** Without a scan result, answers about specific products are guesses. With it, answers are factual.

### Dependency chain

```
Type 1  →  navigate  →  done

Type 6  →  narrow  →  scan (×1-5)  →  compare or constraint check

Type 3A →  scan  →  constraint check  →  done
Type 3B →  answer (suggest candidates)  →  scan  →  constraint check

Type 2  →  scan (×2-5)  →  compare  →  done

Type 4  →  scan  →  label explanation  →  done
```

### Comparison with multiple products (up to 5)
Agent ranks by user's profile preference (low-sodium, high-protein, etc.) if set. If no preference is clear, agent asks: *"What matters most — price, nutrition, or size?"* before giving the verdict.

The scan loop for comparison:
```
Agent: "Scan the ones you're considering."
User scans 1 → auto call → "Got one. Scan more or say done."
User scans 2 → auto call → "Got two. Scan more or say done."
...
User says "done" → Agent compares and gives ranked verdict.
```

---

## Full Action Map

| Load type | Passive signal | Active trigger | Tool | How load is reduced |
|-----------|---------------|----------------|------|---------------------|
| 1 — Search | Aisle signs, wide store view | "Where is the pasta?" | `navigate` | Offloads spatial search |
| 2 — Comparison | 2+ similar products examined, scanned items in session | "Which of these is better?" | `scan` → compare | Offloads multi-attribute comparison |
| 3A — Constraint | Label close-up + constraint in profile | "Is this gluten-free?" | `scan` | Offloads label reading + compliance check |
| 3B — Constraint | Active only — no product in hand | "I need a high-protein snack" | `answer` → `scan` | Converts knowledge gap into action |
| 4 — Comprehension | Nutrition table filling frame | "What does this mean?" | `scan` | Offloads label interpretation |
| 6 — Choice overload | Many similar SKUs + 10s+ dwell | "There are too many options" | `narrow` → `scan` | Reduces option set via dialogue |
| — | — | General grocery question | `answer` | Direct knowledge, 1 sentence |
| — | — | Out of scope | `none` | Redirect to supported actions |

---

## Constraint Management

### Constraint capture (active mode)
Any message that reveals a constraint not in the user's profile triggers an offer to save — question or declaration.

| Example | Behaviour |
|---------|-----------|
| "I'm gluten intolerant" | Answer + offer to save |
| "What's a good gluten-free pasta?" | Answer + offer to save |
| "Is this nut-free?" | Answer + offer to save |
| Already in profile | Answer only |

`new_constraint` returned in response, restricted to known values only:
- Dietary: `vegetarian`, `vegan`, `gluten-free`, `dairy-free`
- Allergens: `peanuts`, `tree-nuts`, `milk`, `eggs`, `wheat`, `soy`, `fish`, `shellfish`, `sesame`
- Preferences: `organic`, `low-sodium`, `low-sugar`, `high-protein`

---

## User Profile

Stored in `user_profile` table (singleton). Injected into every VLM call.

**Dietary** — mutually exclusive per group  
- Meat: `none` / `vegetarian` / `vegan`  
- Gluten: `none` / `gluten-free`  
- Dairy: `none` / `dairy-free`  

**Allergens** — multi-select (FDA big 9) — hard blockers  
`peanuts`, `tree-nuts`, `milk`, `eggs`, `wheat`, `soy`, `fish`, `shellfish`, `sesame`

**Preferences** — multi-select — soft filters  
`organic`, `low-sodium`, `low-sugar`, `high-protein`

**Budget** — `budget_per_trip` (float), `budget_per_item` (float)

### Constraint severity

| Type | Treatment |
|------|-----------|
| Allergens | Hard block — never recommend or confirm |
| Dietary | Soft filter — flag non-compliant products |
| Preferences | Signal — rank or highlight compliant products |
| Budget | Contextual — flag if over limit |

### VLM injection format
```
User profile:
- Dietary: vegan, gluten-free
- Allergens: peanuts, tree-nuts (HARD BLOCK — never recommend)
- Preferences: organic, high-protein
- Budget: $80/trip, max $6/item
```

---

## Load Type Display (Capture Screen)

Small badge in the status bar next to Passive/Active label. Updates on every assistant message. Clears on 👍.

| Value | Label shown |
|-------|-------------|
| 1 | Search |
| 2 | Comparison |
| 3 | Constraint |
| 4 | Comprehension |
| 6 | Choice overload |
| null | Hidden |

---

## VLM Response Schema

Every active and passive VLM response returns:

```json
{
  "tool": "navigate|scan|narrow|answer|none|null",
  "response": "spoken text (1-3 sentences, warm and natural)",
  "load_type": 1,
  "new_constraint": "gluten-free or null"
}
```

`tool=null` → clarifying message, no buttons  
`tool=X` (no result yet) → proposal, show 👎  
Tool result fed back → action complete, show 👍 + 👎  

---

## Passive Detection Pipeline (Backend)

```
Every 3s:
  current_frame + visual_summary + user_profile → /passive_check

Single VLM call:
  → { intervene: bool, message: str|null, load_type: int|null, updated_summary: str }

If intervene=true → push message to app, speak via TTS, switch to active
If intervene=false → update summary, stay passive
```

Reset summary on app restart. Passive polling pauses during active exchanges.
