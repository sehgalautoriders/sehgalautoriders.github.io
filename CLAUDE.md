# Sehgal Autoriders Hero App — working rules

This file is read automatically at the start of every session. Follow it before
anything else. The owner is **Ravi**. He has asked, more than once, that the
communication standard in Part 1 is never dropped again. Treat a deviation from
Part 1 as a defect, the same as a broken function.

---

# PART 1 — HOW TO COMMUNICATE: "LEVEL 5 IIMK HUMAN"

Source: `Level_5_IIMK_Human_Explained.docx` (Ravi's own standard). The whole of
it is summarised here. This is not a suggestion. It is the house style.

**One line: full thinking inside, simple language outside.**

Explain the full matter without reducing its depth, but use language that does
not require the reader to be a lawyer, consultant or software engineer.

## 1.1 The two halves

**Level 5 = complete enough to act.** Not difficult words. Enough depth to cover
the working reality: what it is and why it is needed, how it works start to
finish, who does what and what each person can see or change, what data enters
and how it is protected, what can go wrong and how it is corrected, what the CEO
must approve and what the developer must build, and how success is checked after
launch.

**IIMK Human = easy to read and natural.** It should sound like a capable Indian
manager personally wrote it.

- Simple Class 7–8 English wherever possible.
- Short, clear sentences. One sentence, one idea.
- Calm, factual, respectful, direct.
- Authority without arrogance. Firmness without legal-threat language.
- Real names, dates, numbers, actions and timelines when available.
- No jargon, consultant phrases or obvious AI wording.

Level 5 is **not** the longest answer. It is the answer that covers every point
needed for the decision. Cut unnecessary detail.

## 1.2 Seven questions a Level 5 answer must cover

1. **Meaning** — what exactly is this?
2. **Need** — why do we need it in our real work?
3. **Flow** — what happens step by step?
4. **Roles** — who enters, checks, approves, edits, views?
5. **Controls** — how are mistakes, fraud, misuse and unauthorised access stopped?
6. **Exceptions** — what happens when data is missing, wrong, delayed or disputed?
7. **Decision** — what must be approved now, and what is the next action?

## 1.3 Structure for a technical topic

Use these six headings. Ravi is the CEO, not a developer — start from zero but
still reach implementation depth.

1. **CEO understanding** — what business problem is solved, what the user will
   see, what changes in operations, risk, cost, time, dependency, decision needed.
2. **Simple real-life analogy** — from a dealership, office, bank or daily work.
3. **Full working flow** — input to final result, step by step.
4. **Developer implementation** — tables, APIs, permissions, validation, audit
   logs, error handling, tests, deployment, backup.
5. **Risks and controls** — failure points, misuse, data protection.
6. **What I need to approve** — the exact decision.

Explain every technical term the first time it appears.

## 1.4 Structure for a mail, note or instruction

Context → Facts → Concern or decision → Action required → Timeline → short polite
closing.

## 1.5 Writing rules

- Start with the real point. No greetings or background he already knows.
- Facts before adjectives. Say what happened, when, where, how much. Do not say
  "significant", "critical" or "major" unless the fact proves it.
- Be firm, not aggressive. State issue, impact, responsibility, expected action,
  timeline.
- End with a clear action. He must know exactly what is expected.
- **Do not re-ask facts already provided.** Read back through the conversation
  first.
- **Correct any mistake openly.** Say it plainly once and move on. No long
  apology, no repeating it later.

## 1.6 Never write these

- "I hope this email finds you well."
- "At the outset, we would like to state…"
- "Please be rest assured…"
- "This underscores the importance of…"
- "Going forward, we remain committed…"
- "furthermore", "moreover", "in addition" repeated in every paragraph.
- Legal language where a simple operational instruction is enough.

## 1.7 Check before sending any reply

- Can a non-technical manager understand the main point without help?
- Is it deep enough to actually decide?
- Is the full start-to-finish flow shown?
- Are roles, permissions and responsibilities clear?
- Are risks, exceptions and failure cases covered?
- Are controls, audit trail, testing and backup included where relevant?
- Is every technical term explained simply?
- Does it read like a real Indian manager, not an AI template?
- Are facts, dates, numbers, owners and timelines used where available?
- Does the last section say what must be approved or done next?

The reader should finish with three things: **clear understanding, confidence in
the logic, and a specific next action.**

---

# PART 2 — WHAT THIS PROJECT IS

Sehgal Autoriders is a Hero MotoCorp authorised dealership near Pune (Chinchwad,
Manjri and other workshops). This repo is the staff app — a PWA served from
GitHub Pages at `sehgalautoriders.github.io`, also wrapped as an Android TWA.

Users are the dealership's own staff: gate guards, service advisors (SA),
workshop managers (WM), GM, CEO, parts staff and insurance tele-callers (SMRE).

Live modules: Gate Entry, Estimate, Control Room, Holdup Monitor, Billing, Gate
Out, Parts Scanner, All-India Part Finder, Insurance Renewal CRM, Master Data.

## Real-world rules that must never break

- **No manual estimates.** The SA cannot start an estimate until a Gate Entry
  vehicle is picked. This is deliberate.
- **Labour can never be billed without the part behind it.** If a part comes off
  the estimate, every labour line it brought comes off with it. Ravi's words: a
  customer seeing labour billed with no part will complain to Hero, and that is a
  bigger problem than the app itself.
- **A part on the estimate must keep at least one labour line.** There is always
  work in fitting a part.
- **Model and Date of Sale from DMS records are frozen.** Only WM, GM or CEO can
  unlock them. The SA cannot silently overwrite a DMS record.
- **Never invent a number on screen.** If the data cannot be read, drop the tile
  or say the figure is unavailable. A confident wrong number is worse than a gap.

---

# PART 3 — HOW THE CODE IS BUILT

## Structure

- `index.html` — the whole app. One file, roughly 1 MB, ~21 inline `<script>`
  blocks. There is no build step and no framework.
- `sw.js` — service worker. Carries the build string.
- `assets/` — 33 mascot / character / badge PNGs. Use them; most were unused for
  a long time and Ravi noticed.
- `manifest.json`, icons, `.well-known/assetlinks.json` — PWA and Android TWA.
- The backend is a **Google Apps Script** project talking to Google Sheets. It is
  **not in this repo.** Frontend calls it through `jget` / `jgetRaw` / `jpost`.

## The one architectural rule

**Never edit code in the middle of the file. Append an additive block at the
end.** Every past release did this and it is why the app still works.

A block is: an HTML comment saying who asked and why, then `<style>`, then
`<script>` that replaces functions on `window` at the end of parsing. Existing
call sites pick up the new function with no markup change.

```js
var OLD = window.someFn;
if (typeof OLD === 'function') window.someFn = function () {
  var r = OLD.apply(this, arguments);
  /* the new behaviour */
  return r;
};
```

## Traps already paid for — do not fall in again

- **`let` and `const` at the top level of a script are NOT on `window`.** They go
  into the global lexical scope. `window.USER = x` creates a useless shadow while
  the real `USER` stays untouched. Assign unqualified: `USER = x`.
  Affects `USER`, `ES_PART_INDEX`, `ES_PARTS_READY`, `ES_ADDLAB`, `ES_ADDPART`.
- **Some blocks are wrapped in an IIFE, so their names are unreachable.**
  `ES_MODEL_SRC`, `esModelSrcLine`, `esUnlockModel` are inside one. Assigning to
  them from a later block throws under `"use strict"`. Drive shared DOM state
  instead — for example the `data-locked` attribute the existing guards read.
- **Function declarations at the top level of a script ARE global**, strict mode
  or not. Wrapping those is safe.
- **CSS specificity.** A locked `#es-model` was styled but a later rule outranked
  it, so it rendered plain white for months. Use `#view-x #id.class` and confirm
  with `getComputedStyle`.
- **Never trust one date format.** Sheet timestamps have arrived as
  `DD-MM-YYYY`, `YYYY-MM-DD` and `D/M/YYYY`. Parse all three, and return null on
  anything else rather than guessing.

## Release process

1. Bump the build string in **both** files. They must match or the update check
   refuses to publish.
   - `index.html`: `window.HERO_RELEASE` and `window.HERO_BUILD`
   - `sw.js`: `HERO_BUILD`
   - Format: `R<n>-YYYY.MM.DD.<seq>`
2. Commit on the feature branch, push, open a **draft PR**.
3. GitHub Pages deploys from `main`. **Until the PR is merged, nothing is live
   for the staff.** Say so when reporting status.

---

# PART 4 — HOW TO TEST BEFORE SAYING IT WORKS

Never report a change as working without running these. Ravi has been given
broken releases before and checks.

**1. Every script block must parse.**

```bash
python3 - <<'PY'
import io,re,glob,os
s=io.open('index.html',encoding='utf-8').read()
blocks=re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s, re.S)
d='/tmp/blk/'; os.makedirs(d,exist_ok=True)
for f in glob.glob(d+'*.js'): os.remove(f)
for i,b in enumerate(blocks): io.open(d+'blk_%02d.js'%i,'w',encoding='utf-8').write(b)
print('blocks:',len(blocks))
PY
for f in /tmp/blk/*.js; do node --check "$f" || echo "FAIL $f"; done
```

**2. Boot it in a real browser and require zero page errors.**
Chromium and Playwright are preinstalled — do not install them.

```bash
nohup npx --yes http-server -p 8099 -s . >/dev/null 2>&1 &
# playwright at /opt/node22/lib/node_modules/playwright
```

Block outbound network in the test so backend calls fail fast, drive the real
DOM handlers, and assert on behaviour, not on the code being present.

**3. Screenshot at 412 px wide.** This is a phone app used on the shop floor.

**4. Watch out for test artifacts.** Setting `window.X` for a `let` binding
silently tests nothing. If a result looks too good or too empty, suspect the
harness before the code.

---

# PART 5 — WHERE THINGS STAND

Update this section whenever work lands.

**Branch `claude/estimate-parts-tree-jn37h1`, PR #1, draft, not merged.**
Current build R27-2026.08.03.2.

Done:
- R25 — estimate part search + typed fallback; part:labour rules (dearest kept,
  never the last, part removal cascades, adoption of untagged labour); parts tree
  in All-India Part Finder; insurance 26 standard reasons, day board, and the
  line explaining why the customer list is short.
- R26 — Parts Scanner UI rebuilt; 8 mascots given real jobs.
- R27 — Date of Sale now actually fetches (`heroCustLookup` was short-circuiting
  on the phone cache and never asking the server); Model and Date of Sale frozen
  when they come from DMS records, with WM/GM/CEO unlock.

Pending:
- **Merge PR #1.** Nothing above is live until then.
- Enable **Drive API** under Services in the Apps Script project. Console
  setting, not code. Blocks the live Power BI all-India stock fetch. The project
  number is in the error message on screen — it is not written down here because
  this repo is public.
- Daily insurance-done update, so closed policies drop off the worklist. Needs a
  server route.
- Per-customer daily conversions tracker. Needs a server route.
- Remaining Estimate module items — Ravi has said twice the module is not
  finished. Ask him for the list rather than guessing.

---

# PART 6 — BEFORE YOU REPLY

Run Part 1.7. Then check three things:

1. Did I answer in Level 5 IIMK Human, or did I slip back into AI wording?
2. Did I test what I am claiming, or am I assuming?
3. Does my last line say what Ravi must decide or do next?
