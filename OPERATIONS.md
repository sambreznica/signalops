# OPERATIONS.md — Ticketing Domain Model

This file is authoritative for the ticketing domain. `AGENTS.md` is authoritative on scope. `PRD.md` is authoritative on behaviour. `ARCHITECTURE.md` explains the design.

Everything that creates, routes, or displays a ticket conforms to this document the way everything consumed the frozen schema at session-one item 1. If a later choice disagrees with this file, the file wins until CR-002 is amended in `docs/build-decisions.md`.

Tickets are how an approved action becomes work. The investigation still judges. The board operates.

---

## 1. The four queues

Kestrel is a beta-stage wearable company: one product (Loop), a few hundred devices, a small engineering bench. Four queues is the organisation chart of that bench, not a helpdesk taxonomy. Support tags (the twelve-item table in `synthetic-data/tag-taxonomy.json`) classify *incoming wearer language*. Queues classify *who does the work*.

| Queue | Id | Responsible for |
|---|---|---|
| **Firmware** | `firmware` | Radio stack, connection-supervisor timing, firmware trains, on-device power policy, RTOS. A ticket lands here when the work is a build, a timing change, or a radio investigation — not when a wearer said "it dropped." |
| **Hardware** | `hardware` | Adhesive ring, mechanical seat, sensors, enclosure, wear mechanics. Physical product. Not copy, not a pipeline, not a firmware train. |
| **Product Comms** | `product_comms` | Outward language: readiness presentation, claims review, regulatory communications, partner and press copy. KD-05 is this queue's contract. A claims-misread cluster is work for this queue even when support first tagged it `data-accuracy`. |
| **Data & Telemetry** | `data_telemetry` | Export pipeline, session accounting, companion-app data path, field instrumentation, data quality. Session gaps that are OEM-kill or background-worker issues live here, not on Firmware, until evidence says otherwise. |

A ticket has exactly one queue. Queue is assigned by code from the required skills (see §7), never by the skills assessor and never by free-text matching on the investigation title.

These queues are not the support-playbook queues in KD-03 (`connectivity`, `battery`, `adhesion`, `claims-misread`). KD-03 tells support how to intake. This document tells operations where the resulting work sits.

---

## 2. The engineer roster

Ten people. Invented names. Sized for a beta-stage company that ships Loop to UK, Nordics, DACH, Benelux and Iberia from a London centre of gravity, with a few remotes. This is the whole engineering-adjacent bench that can take operations tickets — not the whole company.

WIP is the number of tickets in `TODO`, `IN_PROGRESS` or `IN_REVIEW` that may sit on one person. `TRIAGE`, `BACKLOG`, `BLOCKED`, `DONE` and `CANCELLED` do not count. Limits are small because the bench is small; a limit that never binds is decoration.

| Id | Name | Queue | Skills | WIP | Timezone |
|---|---|---|---|---|---|
| `eng_priya_nair` | Priya Nair | Firmware | `firmware-build`, `ble-radio`, `rtos` | 2 | `Europe/London` |
| `eng_tomasz_kowalski` | Tomasz Kowalski | Firmware | `ble-radio`, `firmware-build`, `power-management` | 2 | `Europe/Warsaw` |
| `eng_elena_varga` | Elena Varga | Firmware | `firmware-build`, `rtos`, `power-management` | 1 | `Europe/Berlin` |
| `eng_mei_chen` | Mei Chen | Hardware | `adhesive-materials`, `sensor-hardware`, `wear-mechanics` | 2 | `Europe/London` |
| `eng_jonah_adeyemi` | Jonah Adeyemi | Hardware | `sensor-hardware`, `wear-mechanics`, `field-ops` | 2 | `Africa/Lagos` |
| `eng_hannah_briggs` | Hannah Briggs | Product Comms | `regulatory-comms`, `claims-review`, `copy-ops` | 2 | `Europe/London` |
| `eng_luca_ferrara` | Luca Ferrara | Product Comms | `claims-review`, `regulatory-comms` | 1 | `Europe/Rome` |
| `eng_samira_elsayed` | Samira El-Sayed | Data & Telemetry | `telemetry-pipeline`, `data-quality`, `session-accounting` | 2 | `Europe/London` |
| `eng_owen_walsh` | Owen Walsh | Data & Telemetry | `mobile-app`, `telemetry-pipeline`, `session-accounting` | 2 | `Europe/Dublin` |
| `eng_yuki_tanaka` | Yuki Tanaka | Data & Telemetry | `telemetry-pipeline`, `field-ops`, `data-quality` | 3 | `Asia/Tokyo` |

Home queue is where their WIP is budgeted, not a wall. Routing may assign a ticket to an engineer whose home queue differs from the ticket queue when skill overlap and capacity say so. The swimlane still follows the ticket's queue.

The prototype has one operator, who acts for every actor. Activity records the engineer id when the operator moves work onto or off that person, and `operator` when the act is the operator's own (manual create, bulk, reopen). Timezones are roster facts for plausibility and for a later capacity display; they do not affect `due_at`.

---

## 3. The skills taxonomy

Fifteen skills. Each has exactly one home queue. Skills name expertise, not incidents.

| Skill | Home queue | What it is |
|---|---|---|
| `ble-radio` | Firmware | BLE link, supervisor timing, 2.4 GHz coexistence. |
| `firmware-build` | Firmware | Cutting, shipping, and bisecting a firmware train. |
| `rtos` | Firmware | On-device scheduler, idle, retry. |
| `power-management` | Firmware | Charge, drain policy, on-device power. |
| `adhesive-materials` | Hardware | Ring chemistry, lot, peel, wear-cycle adhesive. |
| `sensor-hardware` | Hardware | Accelerometer, thermistor, physical sensing path. |
| `wear-mechanics` | Hardware | Magnetic seat, enclosure, fit, reseat. |
| `regulatory-comms` | Product Comms | Policy, banned phrases, outward claims, regulator-facing language. |
| `claims-review` | Product Comms | Whether a piece of copy (app, support, partner, press) is a claims event. |
| `copy-ops` | Product Comms | Writing and shipping in-product and support language. |
| `telemetry-pipeline` | Data & Telemetry | Export, ingest, device-day accounting. |
| `mobile-app` | Data & Telemetry | Companion app, background workers, OEM behaviour. |
| `session-accounting` | Data & Telemetry | `session_gap_minutes`, authenticated session lifecycle. |
| `data-quality` | Data & Telemetry | Missing fields, mis-instrumentation, denominator bugs. |
| `field-ops` | Data & Telemetry | Device recovery, wear-study protocol, in-region checks. |

### Hard constraint — no skill maps one-to-one onto a seeded incident

Same rule as the support tags (ARCHITECTURE §4). Tags identify subject matter, not truth. Skills identify expertise, not a seeded answer.

A skill that only ever applied to SIG-001 (or SIG-002, SIG-003, SIG-004) would leak the answer into the roster the way a tag named `sig-001-firmware` would leak it into triage. Therefore:

1. **No skill is named after a signal, incident, known-issue, firmware version, or region.** Forbidden in a skill id: `SIG-`, `INC-`, `KI-`, a version string matching `\d+\.\d+`, and the tokens `nordics`, `readiness`, `disconnect`, `adhesion-failure`, `battery-drain` used as the skill itself.
2. **No skill is the unique fingerprint of one seeded scenario.** A typical action for a seeded scenario requires a *set* of skills, and every skill in the taxonomy has at least one plausible use that is not that scenario.

Non-seeded uses (the existence proof that the skill is not a disguised incident label):

| Skill | Work that is not a seeded incident |
|---|---|
| `ble-radio` | Office 2.4 GHz chatter (KI-RF-003); PHY / advertising investigations on any train. |
| `firmware-build` | Cutting 1.4.3; bisecting a build that is not 1.4.2. |
| `rtos` | Idle-skip characterisation on 1.4.1; scheduler bugs unrelated to BLE counts. |
| `power-management` | Charge-puck complaints; indoor drain step-changes outside Nordics. |
| `adhesive-materials` | Lot peel, pouch print, scheduled ring-replacement quality. |
| `sensor-hardware` | Accelerometer scale error; thermistor as a *sensor* defect, not a climate story. |
| `wear-mechanics` | Loose magnetic seat that looks like radio loss (KD-01 §2.1). |
| `regulatory-comms` | Policy 3.1 tabletop; partner one-pager review; investor FAQ. |
| `claims-review` | A single press screenshot; a support-macro rewrite; not only a cluster. |
| `copy-ops` | In-app chrome colour copy (KI-UI-011); charging-puck leaflet. |
| `telemetry-pipeline` | A missing export field; a denominator bug in device-days. |
| `mobile-app` | OEM background kill (KI-AP-019); iOS permission copy. |
| `session-accounting` | Iberia session-gap (KI-IB-022); authenticated-session definition. |
| `data-quality` | A tag applied inconsistently; a null region; a duplicate device-day. |
| `field-ops` | Wear-study protocol; recovering a core from a beta household. |

### How the constraint is checked

A unit test against the committed taxonomy (the same file the router reads):

1. Every skill id is in the closed list above. Extra keys fail.
2. No skill id matches `/SIG-|INC-|KI-/`, `/\d+\.\d+/`, or the forbidden tokens in (1).
3. The non-seeded-use table is committed next to the taxonomy. Every skill has a row. An empty use fails.
4. No golden routing fixture keyed to a sidecar signal id (`SIG-001` … `SIG-004`) is allowed to require a singleton skill that no other fixture uses. If a seeded scenario's typical action needs `{ble-radio, firmware-build}`, that is legal; `{sig-001-radio}` is not representable.

The test does not score whether routing picked the "right" queue for a seeded incident. That would be fitting the roster to the answer. The test only proves the taxonomy cannot encode the answer.

---

## 4. Priority derivation

Computed in code. Never by a model. Never by the operator except on a manual ticket (see below).

Inputs: the approved action's `risk_class` and the investigation's **granted** severity band (`HIGH | MEDIUM | LOW`). Granted, not model-requested — the ceiling has already run.

|  | HIGH | MEDIUM | LOW |
|---|---|---|---|
| **PRODUCTION** | URGENT | HIGH | HIGH |
| **EXTERNAL** | URGENT | HIGH | MEDIUM |
| **INTERNAL** | HIGH | MEDIUM | LOW |

PRODUCTION never sits below HIGH: a production change that is "only LOW" confidence is still a production change. INTERNAL never sits at URGENT: an internal ticket is not a customer or production event.

The four stored values are `URGENT | HIGH | MEDIUM | LOW`. There is no `NONE`. Manual tickets have no investigation band and no `risk_class`. The operator sets priority; the default is MEDIUM (the old P3 row). The labels HIGH / MEDIUM / LOW here are priority, not confidence bands — the matrix inputs remain the investigation's granted confidence band.

Display is glyphs, not words. URGENT is the only non-bar glyph.

Priority is stored on the ticket. It is not recomputed when severity is later argued about; a new approved action creates a new ticket.

---

## 5. SLA policy and `due_at`

Elapsed time from `created_at`. Not business hours. Engineer timezones do not shift the clock.

| Priority | SLA | `due_at` |
|---|---|---|
| URGENT | 4 hours | `created_at + 4h` |
| HIGH | 1 day | `created_at + 24h` |
| MEDIUM | 3 days | `created_at + 72h` |
| LOW | 7 days | `created_at + 168h` |

A card's age tints red when `now > due_at` and status is not `DONE` or `CANCELLED`. Meeting the SLA is not a status transition; DONE after `due_at` is still late, and the activity log keeps `due_at` unchanged.

There is no pause-on-BLOCKED. Blocking is visible; it does not rewrite the promise.

The SLA durations are not shortened to make a demo turn red. That would be the severity-distribution mistake: a number present so it can be seen, not because it is true.

**Clock.** The board reads `now` from a single source. In live mode that source is wall-clock. In replay mode it is the run artefact's `timestamp` — the same stamp already shown in the chrome — not the interviewer's laptop. `created_at` is written from that clock. Tickets created during a replay session therefore age against the run's own frame of reference. The UI labels this the way replay is already labelled.

Replay at T0 is not overdue by construction: `created_at` equals the frozen stamp, so `now > due_at` is false. That is correct. Do not backdate `created_at` and do not shrink URGENT to minutes to paint a card red. Live mode uses wall-clock against the same `due_at`; tickets written at a run timestamp that is already days in the past are overdue, and that is how the tint is real. `src/lib/tickets/overdue.test.ts` pins both clocks.

---

## 6. Status lifecycle

Eight statuses. Linear's list is seven; **BLOCKED stays** (CR-002). Operations work can wait on a lab cut or a regulator; that is not verification. BLOCKED is the only WIP-free mid-life state so stuck work stops consuming capacity without losing its assignee. A boolean flag that changed WIP would be a status wearing a disguise.

```
TRIAGE ──► BACKLOG ──► TODO ──► IN_PROGRESS ──► IN_REVIEW ──► DONE
                         │            │              │
                         │            ▼              ▼
                         │         BLOCKED ◄─────────┘
                         │            │
                         └────────────┴── CANCELLED
```

| Status | Means | Rail or column | Counts WIP |
|---|---|---|---|
| `TRIAGE` | Intake, unowned, no queue. Forces a human to accept work. | Rail | No |
| `BACKLOG` | Accepted into a queue, not yet owned. | Rail | No |
| `TODO` | Queued, assignee named, not started. | Column (collapsed when empty) | Yes |
| `IN_PROGRESS` | Work is underway. | Column | Yes |
| `IN_REVIEW` | Awaiting verification. Assignee still owns it. | Column | Yes |
| `BLOCKED` | Work cannot proceed. `due_at` does not move. | Column | No |
| `DONE` | Work finished. Terminal unless the operator reopens. | Column | No |
| `CANCELLED` | Dropped. Grey, never red — dropped work is not an error. Terminal unless the operator reopens to TODO. | Column | No |

### Transitions and who may make them

The prototype has one operator. The table is the contract the UI and the router must still obey, so a drag cannot invent a ninth state.

| From | To | Who | Meaning |
|---|---|---|---|
| (create) | `TRIAGE` | routing, when no skills remain so queue is null; or operator, on manual create without a queue | Ticket exists; nobody owns it; no queue. |
| (create) | `BACKLOG` | routing, when skills named a queue but no eligible engineer is under capacity; or operator, manual create with a queue and no assignee | Accepted into a queue, unowned. |
| (create) | `TODO` | routing, when an engineer is selected | First assignment at birth. Queue and assignee are non-null. |
| `TRIAGE` | `BACKLOG` | operator (sets a queue) | Accepted. Still unowned. |
| `TRIAGE` | `TODO` | operator | Queue **and** assignee set in the same gesture, or refused. **Refused while `queue` is null.** |
| `BACKLOG` | `TRIAGE` | operator | Queue cleared. Assignee remains null. |
| `BACKLOG` | `TODO` | operator (drag onto a person / pick assignee) | Someone now owns it. |
| `TODO` | `IN_PROGRESS` | operator acting as the assignee | Work started. |
| `TODO` | `BACKLOG` | operator | Unassign. Assignee cleared. Queue kept. |
| `TODO` | `TRIAGE` | operator | Queue and assignee cleared. |
| `TODO` | `CANCELLED` | operator | Dropped before start. |
| `IN_PROGRESS` | `IN_REVIEW` | operator acting as the assignee | Awaiting verification. |
| `IN_PROGRESS` | `BLOCKED` | operator acting as the assignee | Work cannot proceed; WIP frees. |
| `IN_PROGRESS` | `TODO` | operator | Stopped without blocking; still owned. |
| `IN_PROGRESS` | `DONE` | operator acting as the assignee | Work finished. |
| `IN_PROGRESS` | `CANCELLED` | operator | Dropped in flight. |
| `IN_REVIEW` | `DONE` | operator | Verified. |
| `IN_REVIEW` | `IN_PROGRESS` | operator | Changes requested. |
| `IN_REVIEW` | `BLOCKED` | operator | Verification cannot proceed; WIP frees. |
| `IN_REVIEW` | `CANCELLED` | operator | Dropped in review. |
| `BLOCKED` | `IN_PROGRESS` | operator | Blocker cleared. |
| `BLOCKED` | `IN_REVIEW` | operator | Blocker cleared; still awaiting verification. |
| `BLOCKED` | `TODO` | operator | Blocker stands; returned to owned-not-started. Split into two activity entries if assignee also changes. |
| `DONE` | `IN_PROGRESS` | operator only | Reopen. Rare; logged. |
| `CANCELLED` | `TODO` | operator only | Reopen. Rare; logged. Requires queue and assignee already set, as TODO does. A cancelled judgement can turn out incorrect — the noise cluster that was dismissed and then recurred is the canonical case. Forbidding reopen would mean deleting and recreating, which loses the activity log. |
| any | any other assignee | operator | Reassignment. Status may stay or change in the same gesture. Two activity entries: `reassigned`, then `status` if status also changed. |

**Invariant.** `queue` may be null only while status is `TRIAGE`. A null-queue ticket has a home on the rail and nowhere else. `BACKLOG` requires a non-null queue and a null assignee. `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED` and `DONE` require a non-null queue and a non-null assignee. `CANCELLED` keeps whatever queue and assignee it had; reopen to `TODO` is refused unless both are already set.

Illegal: `TRIAGE` → `TODO` while `queue` is null; `TRIAGE` → `IN_PROGRESS` / `IN_REVIEW` / `BLOCKED` / `DONE`; `BACKLOG` → `IN_PROGRESS` / `IN_REVIEW` / `BLOCKED` / `DONE`; `BLOCKED` → `DONE`; `DONE` → `TRIAGE` / `BACKLOG` / `BLOCKED`; `CANCELLED` → anything except `TODO`; `CANCELLED` → `TODO` while queue or assignee is null. Unowned work cannot be in progress, in review, blocked, or finished. Unqueued work cannot leave the rail except into `BACKLOG` (queue first). Finished or cancelled work cannot return to the rail. A blocker must clear before work completes. The board refuses those drops: illegal targets are disabled, so a drop never succeeds and then snaps back.

Every transition appends an `activity[]` entry with `kind`, `from`, `to`, `actor`, `at`. That log is what makes it a ticket rather than a card. Optimistic paint is allowed; the commit still goes through the single mutation function. Undo is a compensating transition (a new activity row), never a silent rewind of `activity[]`.

---

## 7. The routing contract

Reference: ARCHITECTURE §1. The line is the same line as triage and the confidence ceiling. Semantic interpretation is a model call. Ranking, capacity, priority and clocks are code.

### What the model decides (skills assessor)

A single structured call. No tools. No roster. No WIP numbers. No priority table. No SLA. No engineer names. No queue id.

It receives: the approved action's `description` and `risk_class`; the investigation `title`, `summary`, `status`, granted severity band, and leading hypothesis statement. It does not receive `confidence` (same reason as the critic — anchoring). It receives the closed skill list and nothing else from this file.

It emits:

- `skills_required[]` — a subset of the taxonomy. Empty is legal; it means "I cannot name the expertise," not "assign to anyone."
- `expertise_rationale` — why those skills, in prose. Name the kind of work, not its measurements — the investigation holds the figures and the ticket links to it. Do not name a person or a team.

Unknown skill ids are rejected by code. If none remain, the ticket is created `TRIAGE` with empty `skills_required` and a `routing_rationale` that says the assessor produced no usable skill. The ticket still exists. Routing does not invent skills to keep the board pretty.

The assessor has no `{f_n}` sink. A numeral or finding-ref in `expertise_rationale` is a prompt finding, not a repair loop: reject the emit and take the same empty-skills path (`fallback: "bare_numeral"`). One structured call. No second turn.

The assessor is the third model role because *what expertise this action needs* is semantic. "This is a claims event, not a radio event" is not arithmetic. Everything after that is.

### What code decides

1. **Validate skills** against the closed taxonomy. Drop unknowns. Record drops.
2. **Queue.** Each remaining skill has a home queue. The ticket queue is the mode of those homes. Tie-break order: `firmware`, `hardware`, `product_comms`, `data_telemetry`. If no skills remain, `queue` is null and status is `TRIAGE`. Null is not temporary: it is the triage state until the operator sets a queue. `TRIAGE` → `TODO` is refused while `queue` is null (§6). Manual tickets: operator sets the queue; without one they stay on the rail as `TRIAGE`; with a queue and no assignee they land `BACKLOG`.
3. **Priority** from the table in §4.
4. **`due_at`** from §5.
5. **Eligible engineers.** Intersection of roster skills with `skills_required` is non-empty, and current WIP (`TODO` + `IN_PROGRESS` + `IN_REVIEW`) is below that engineer's limit.
6. **Rank.** Highest `|skills ∩ required|`. Tie: fewest current WIP tickets. Remaining tie: roster table order (stable).
7. **Assign.** Winner → `assignee`, status `TODO`. If the eligible set is empty → `assignee` null, status `BACKLOG` when a queue exists, otherwise `TRIAGE`. Code does not overflow a WIP limit to force an owner.
8. **`routing_rationale`.** Composed by code from the assessor's `expertise_rationale`, the overlap set, the WIP check, and the tie-break. This is what the ticket-detail drawer shows under "why this engineer." The model never writes this field.

### Why the line falls there

ARCHITECTURE §1: the model is never trusted with numbers. Overlap counts, WIP remaining, SLA offsets, and the priority matrix are numbers. Putting them in a prompt would be the confidence-ceiling mistake wearing a roster. The assessor names expertise; code names a person.

The assessor does not pick the queue for the same reason. Queue is a function of skill homes. Letting the model say "Firmware" while emitting `{claims-review}` would desynchronise the two facts the board depends on.

---

## 8. Ticket model

```
ticket_id          string     queue-prefixed, unique per run
                              FW-n firmware · HW-n hardware · PC-n product_comms ·
                              DT-n data_telemetry · TR-n triage (no queue at mint)
                              Immutable once assigned. A later queue change does
                              not rewrite the id. Used in URLs: /board?ticket=FW-1
title              string     plain English, code-composed from investigation
                              subject + action type (see below)
body               string
queue              firmware | hardware | product_comms | data_telemetry | null
                   null only while status is TRIAGE (§6)
assignee           engineer id | null
priority           URGENT | HIGH | MEDIUM | LOW
status             TRIAGE | BACKLOG | TODO | IN_PROGRESS | IN_REVIEW |
                   BLOCKED | DONE | CANCELLED
source             { investigation_id, action_id, candidate_id } | "manual"
skills_required    skill id[]
routing_rationale  string     code-composed; see §7
created_at         string     ISO-8601
due_at             string     ISO-8601, from §5
updated_at         string     ISO-8601
notes[]            { author, body, at }
activity[]         { kind, from, to, actor, at }
```

`activity[].kind` is a closed set: `created` · `status` · `reassigned` · `note` · `priority` · `queue`. `from` / `to` are the previous and next values for that kind (`null` on `created`). `actor` is `routing` | `operator` | an engineer id.

`source` is `"manual"` only for operator-created tickets. Approval-created tickets always carry the three ids. There is no `"agent"` source. A ticket is not created for an action that has not been approved. EVAL-08 continues to assert that `EXTERNAL` and `PRODUCTION` never reach the execution path without approval; ticket creation is on the far side of that same gate, not a bypass around it.

**Titles.** Generated in code from the source investigation's subject (candidate firmware version or humanized tag — never the investigation title, which contains conclusions) plus a detected action type. Sentence case, no trailing period, under ~70 characters. No schema field names, no `{f_n}` references, no word from the status or priority enums. Identifiers and version strings are allowed — they identify, they do not measure. The freeze is the generator test, not a hand-written list.

Ticket prose is about work, not investigation output. EVAL-04 scores investigation records, not tickets. The split is who wrote the text:

- **Code-composed fields** — `routing_rationale`, and any `title` or `body` generated from an approved action — SHALL contain no bare numerals. Same helper the investigator uses (`renderFindingRefs` / the EVAL-04b identifier grammar). Identifiers (`FW-1`, `cnd_fw_1_4_2`, firmware versions, `KD-` / `INC-` / `KI-` ids) are names, not quantities. A `{f_n}` in a ticket field is a bug: the investigation remains the source of numbers, via the source link. Enforcement is structural, not a prompt instruction.
- **Operator-typed notes** — `notes[].body` — are exempt. A human typing in a text box is not the system making a claim.

---

## 9. Persistence

`localStorage`, keyed by run id. Real across refresh and session. Single browser, single operator, no sync.

This is a product bound, not a temporary stub. It is labelled in the UI (Board and ticket drawer) and in the README when the layer ships. Another browser, another machine, a cleared origin, or a different run id is a different board.

There is no server-side ticket store, no database, and no attempt to reconcile two tabs beyond what the browser's `localStorage` already does.

**Replay clock.** Ticket age is not a second clock. In replay, `now` is the run artefact's `timestamp` (§5). `created_at` written during a replay session uses that stamp. The bound is labelled next to the existing replay chrome, not discovered by noticing that nothing is ever red. Live mode uses wall-clock. Do not mix the two in one comparison.

---

## 10. Board (the fourth screen)

One route. Not a fifth screen.

- Columns by status: `IN_PROGRESS` · `IN_REVIEW` · `BLOCKED` · `DONE`. `TODO` is a column only when it has content, otherwise collapsed. `CANCELLED` is a column.
- **Rail** for `TRIAGE` and `BACKLOG` (unowned), separate from the columns so unowned work is not pretending to sit in a swimlane as an owned card.
- Collapsible swimlanes by queue inside the columns.
- Drag-and-drop across columns (status) and across swimlanes (queue, and reassignment when dropped onto a person). `@dnd-kit/core` is the CR-001 dependency for this. Keyboard navigation is required; HTML5 drag-and-drop is not an acceptable implementation. Illegal targets are disabled during drag.
- Cards carry, in scan order: identifier (mono), status icon if not grouped by status, priority glyph, title (dominant), skills chips (max 2 + overflow), source chip (candidate id or `manual` — never `agent`), assignee initials, age tinted past `due_at`.
- Sort within each cell by priority, then `due_at`, then id.
- When more than 70% of visible tickets sit in one column, a quiet hint offers to regroup by priority or assignee. Do not seed tickets to fill columns.
- Filters: queue, assignee, priority, source, status.
- Per-swimlane capacity: count of `TODO` + `IN_PROGRESS` + `IN_REVIEW` in that queue versus the sum of WIP limits of engineers whose **home** queue is that swimlane. Over-capacity is visible, not blocked — routing will not *create* over-capacity; a human drag may.
- Bulk select. Manual ticket creation. Keyboard navigation.

Ticket detail is a **slide-over drawer, not a route**. Deep link `/board?ticket=FW-1`. There is no `/tickets/[id]`. Full body; WHY THIS ENGINEER split into assessor vs code; WHERE THIS CAME FROM including the confidence it rests on; inherited grounding (the ticket retrieved nothing); notes; complete activity log.

---

## 11. Investigation page

Approval of an action creates a real ticket and shows it inline: `ticket_id`, queue, assignee, priority, link to the Board (which opens the drawer for that id). No ticket is shown for an unapproved action. Simulation of `INTERNAL` execution and creation of the ticket are the same approval, not two gates.

---

## 12. Explicitly out, and why

| Out | Why |
|---|---|
| Multi-user | One operator. Accounts would be theatre. |
| Notifications / email | Nobody is listening. |
| Time tracking / billing | No business. |
| Client portal | Wearers are not users of this tool. |
| Real-time sync | Single browser; see §9. |
| Saved views / custom fields / automation rules | A real desk with real volume. Four queues and fifteen skills are the customisation this bench gets. |
| Jira / Linear / Slack export | Post-MVP. This board *is* the ticketing system. |

---

## 13. Build order — routing first, board second

The board is a container. Built first, its cards would be designed against placeholder tickets and redesigned once routing revealed the real shape. Routing first also front-loads the risk: a poor queue assignment is worth finding at hour two, not at hour nine with a board already built around it.

**Step 1 — routing, until a visible ticket exists.** Ticket model, taxonomy, roster, skills assessor, code rank / WIP / queue / priority / SLA, persistence keyed by run id, approval creates a ticket, investigation page shows it. Committed artefact of a real routed ticket. Step 1 is **not complete** until that visible ticket exists, even before the board exists.

**Step 2 — board.** Columns, swimlanes, on-deck rail, drag-and-drop, drawer, filters, capacity, bulk, manual create, keyboard.

Do not start step 2 until step 1 has a ticket on the investigation page that a person can read.
