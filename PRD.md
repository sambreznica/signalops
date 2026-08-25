# SignalOps — Product Requirements Document

> An agentic product-intelligence prototype for wearable-health operations.
> **All data, telemetry, feedback and internal documentation described in this document are synthetic and fictional.**

---

## 1. Document Control

| Field | Value |
|---|---|
| Document | `PRD.md` |
| Version | 1.0 — **FROZEN** |
| Status | Approved for implementation |
| Owner | Sam |
| Purpose | Independent synthetic prototype built as an inspectable technical working sample |
| Build budget | ~5 hours implementation + ~3 hours documentation, evidence curation, deploy |
| Sessions | Two, with a checkpoint at the session boundary |
| Change policy | Any addition requires a removal of equal scope, recorded in `docs/build-decisions.md` |

**Frozen manifest.** These are counts, not guidelines: **5 tools · 4 screens · 10 evaluations · 6 knowledge documents · 3 seeded incidents + 1 noise cluster · 8 P0 capabilities.**

---

## 2. Executive Summary

Wearable-health companies receive fragmented signals about their product: support tickets and beta feedback on one side, device telemetry and version data on the other, and internal knowledge (specifications, release notes, known issues, policies, past incidents) scattered across documents. Dashboards show *what changed*. Retrieval systems show *what documents say*. Neither answers the question a product lead actually has: **is this real, why is it happening, what contradicts that explanation, and what should we do next?**

SignalOps is a prototype investigation system for that question. A deterministic triage layer computes candidate signals from structured data with no model involvement. An orchestrator then investigates a selected signal by choosing tools adaptively — what it calls second depends on what the first call returned. Retrieval grounds every knowledge-backed claim in a specific document passage. A separate critic then attempts to **falsify** the leading hypothesis rather than review it. Confidence is banded and capped by code, not asserted by the model. Consequential actions are blocked behind per-action human approval.

The system is measured against four seeded scenarios with known ground truth — three genuine incidents and one plausible-looking cluster that is not an incident — and against a single-call baseline, so that the architecture's contribution is measured rather than assumed.

---

## 3. Problem Statement

A Product/Operations Lead at a wearable company notices elevated complaint volume. To reach a defensible judgement they currently:

1. open a BI tool and slice telemetry by firmware, app version, cohort and region;
2. read support tickets to find whether complaints share a semantic pattern;
3. search a wiki for release notes, known issues and prior incidents;
4. form a hypothesis;
5. attempt — usually informally, often not at all — to disprove it;
6. decide what engineering should investigate.

This takes one to two days and the falsification step is the one most often skipped. The resulting judgement is frequently correlational evidence presented with causal confidence.

**The counterfactual SignalOps addresses is that workflow.** The metric is *time to defensible judgement*, where "defensible" carries the weight: the evidence trail is the deliverable, not a debugging aid.

---

## 4. Product Hypothesis

> A product lead reaches a defensible judgement about an emerging product signal faster when an agent gathers evidence adaptively across deterministic telemetry, qualitative feedback and grounded internal knowledge — and that judgement is only trustworthy because a separate falsification pass surfaces counter-evidence and permits "uncertain" and "not an incident" as legitimate terminal states.

Both halves are testable. The first is tested by the seeded-incident evals; the second by the noise case, the critic-effect eval and the confidence ceiling.

---

## 5. Goals

| ID | Goal | Priority |
|---|---|---|
| G-1 | Correctly identify three seeded incidents from synthetic data without ground truth being visible to the agent | P0 |
| G-2 | Correctly decline to escalate a plausible-looking noise cluster | P0 |
| G-3 | Make the deterministic/probabilistic boundary mechanically verifiable, not merely stated | P0 |
| G-4 | Ground every knowledge-backed claim in an inspectable passage | P0 |
| G-5 | Demonstrate falsification that measurably changes outcomes | P0 |
| G-6 | Keep consequential actions behind explicit per-action approval | P0 |
| G-7 | Quantify the architecture's contribution against a single-call baseline | P0 |
| G-8 | Be fully comprehensible from the repository alone in under 10 minutes | P0 |
| G-9 | Demo reliably in ~3 minutes | P0 |

---

## 6. Non-Goals

**Explicitly out of scope.** Authentication, user accounts, billing, permissions, production infrastructure, real wearable integration, any real company's data, Jira/Slack/email integration, mobile app, production observability, autonomous remediation, fine-tuning, custom embedding models, knowledge graphs, multi-agent frameworks, streaming telemetry, background workers, clinical functionality, medical diagnosis, treatment recommendation, scalability engineering.

**Additionally excluded by this PRD.** Float confidence scores; any vector database; any database at all; a chat interface; user-triggered data regeneration; a fifth screen; a sixth tool; an LLM-as-judge in the eval suite; multi-run comparison views; incident types beyond the four specified; search UI on the Knowledge screen.

**Not a medical device.** SignalOps is an internal operations tool. It does not diagnose, advise on treatment, or make clinical claims, and the output schema contains no field capable of expressing one.

---

## 7. Target Users

**Primary — Product / Operations Lead** at a fictional wearable-health company. Needs to know whether an emerging signal is real, what explains it, and what to hand to engineering. Technically literate; not a data scientist. Accountable for the judgement.

**Secondary — Customer Support Lead.** Sees complaint clusters first, needs to know whether a pattern is a known issue, a real regression, or noise, and what to tell customers.

No further personas in MVP.

---

## 8. Core User Journey

1. Open **Command Centre**. Ranked candidate signals, each showing affected users, rate delta, trend and status.
2. Select the connectivity signal (SIG-001).
3. Start (or replay) the investigation. The **trace** streams: tool calls, arguments, result summaries, and the reasoning that selected each next call.
4. Deterministic findings appear as typed claims, each linked to the tool call that produced it.
5. Retrieved knowledge appears with document, section and chunk, expandable to the passage.
6. A leading hypothesis is produced, with `evidence_type` and a proposed confidence band.
7. The **critic** runs in a separate context, produces an alternative explanation and a named falsifying test, and requests further evidence. One branch is weakened; the outcome changes.
8. The confidence ceiling is applied by code. If the model requested a band the rules disallow, the refusal is visible in the trace.
9. Supporting evidence, counter-evidence and residual uncertainty are shown side by side.
10. Recommended actions appear with risk classes. Internal-only actions can be simulated; external actions are blocked until approved.
11. Approve one action. Simulated execution is logged.
12. **Evaluations** screen: 10 assertions, plus the baseline comparison on the neutral subset.

---

## 9. Functional Requirements

### 9.1 Signal Triage (deterministic)

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Triage SHALL compute candidate signals from fixtures using ordinary code only. No model call may occur in this path. | P0 |
| FR-002 | The comparison window SHALL be the 14 days preceding `SYNTHETIC_TODAY = 2026-05-18`, compared against the prior 14 days. | P0 |
| FR-003 | Triage SHALL emit ≥4 candidate signals with: affected user count, rate in window, rate in prior window, delta, trend direction, computed severity. | P0 |
| FR-004 | Severity SHALL be computed as `(normalised_affected × rate_delta) × trend_factor × consequence_weight`, with the formula documented in `ARCHITECTURE.md`. | P0 |
| FR-005 | `consequence_weight` SHALL rank regulatory/claims exposure above raw volume, so a small high-consequence cluster can outrank a large low-consequence one. | P0 |
| FR-006 | Triage output SHALL be unit-tested against fixtures with expected values asserted. | P0 |

### 9.2 Investigation Orchestrator

| ID | Requirement | Priority |
|---|---|---|
| FR-010 | The orchestrator SHALL use native SDK tool-calling. No agent framework. | P0 |
| FR-011 | Tool selection SHALL be model-driven. No predetermined sequence may be hard-coded. | P0 |
| FR-012 | At least one branch point SHALL be genuine: a differing tool result must produce a differing subsequent call. | P0 |
| FR-013 | The orchestrator SHALL be bounded: investigator max 12 tool calls / 120s; critic max 2 rounds of 4 tool calls / 60s. The critic budget is not a share of the investigator's. Exceeding a bound terminates with status `INCONCLUSIVE`. | P0 |
| FR-014 | Every tool call SHALL be persisted with id, name, arguments, result summary, latency and token count. | P0 |
| FR-015 | The agent SHALL NOT receive ground-truth labels, incident names, or expected conclusions in any prompt or fixture field it can read. | P0 |
| FR-016 | Sampling parameters (`temperature`, `top_p`, `top_k`) SHALL NOT be sent. Effort SHALL be set explicitly. Adaptive thinking cannot be disabled on the current model class. | P0 |

### 9.3 Tools (exactly five)

| ID | Tool | Returns |
|---|---|---|
| FR-020 | `query_telemetry(filters, window)` | Aggregated rates, counts, cohort breakdown |
| FR-021 | `compare_versions(metric, version_a, version_b)` | Rate per version, ratio, cohort sizes, significance flag |
| FR-022 | `search_feedback(query, filters)` | Matching records with metadata; cluster stats |
| FR-023 | `search_knowledge(query, doc_filter?)` | Top-k chunks with doc, section, chunk id, score |
| FR-024 | `find_similar_incidents(description)` | Historical incidents from KD-06 with resolution and outcome |

`get_release_notes` is deliberately absent: release notes are KD-02, reachable via `search_knowledge` with a document filter. A filter argument dressed as a tool would inflate the apparent tool count without adding a decision point.

### 9.4 Critic / Falsification

| ID | Requirement | Priority |
|---|---|---|
| FR-030 | The critic SHALL run in a **separate context** and SHALL NOT receive the investigator's proposed confidence band. | P0 |
| FR-031 | The critic's objective SHALL be falsification, not review. Its system prompt SHALL NOT contain evaluative framing ("is this good?"). | P0 |
| FR-032 | The critic SHALL produce ≥1 alternative hypothesis and ≥1 **named falsifying test** — a specific observation that would disprove the leading hypothesis. | P0 |
| FR-033 | The critic MAY call tools (FR-020–024) to test its alternative. | P0 |
| FR-034 | The critic MAY downgrade status, downgrade confidence, or reorder hypotheses. Its effect SHALL be recorded in the trace. | P0 |
| FR-035 | `UNCERTAIN`, `INCONCLUSIVE` and `NOT_AN_INCIDENT` SHALL be legitimate terminal states. | P0 |

### 9.5 Confidence and Claim Discipline

| ID | Requirement | Priority |
|---|---|---|
| FR-040 | Confidence SHALL be `LOW` / `MEDIUM` / `HIGH`. Numeric confidence is prohibited. | P0 |
| FR-041 | The model proposes a band with justification; **code enforces a ceiling**. | P0 |
| FR-042 | `HIGH` SHALL be mechanically unavailable when: `evidence_type` is `correlational`; OR unrebutted critic counter-evidence exists; OR affected cohort < 25 users. | P0 |
| FR-043 | Where the ceiling overrides the model's request, the trace SHALL record requested band, granted band and the rule invoked. | P0 |
| FR-044 | Every hypothesis SHALL carry `evidence_type: correlational \| causal \| documented`. | P0 |
| FR-045 | Where `evidence_type` is `correlational`, the hypothesis text SHALL NOT contain unhedged causal verbs (`causes`, `caused by`, `results in`, `due to`, `because of`). | P0 |
| FR-046 | Every quantity in the output SHALL be a typed object `{value, unit, source_tool_call_id}`. | P0 |
| FR-047 | Free-text fields SHALL contain no bare numerals. A figure in prose SHALL be a `{f_n}` reference to a `deterministic_findings` id. Quantities are rendered from typed claims by the UI. A reference to a missing finding is a validation failure. | P0 |

### 9.6 Human-in-the-Loop

| ID | Requirement | Priority |
|---|---|---|
| FR-050 | Every recommended action SHALL carry `risk_class: INTERNAL \| EXTERNAL \| PRODUCTION`. | P0 |
| FR-051 | `INTERNAL` actions MAY be simulated on approval. `EXTERNAL` and `PRODUCTION` SHALL be blocked from the execution path until explicitly approved in the UI. | P0 |
| FR-052 | The system SHALL NOT contact customers, alter firmware, roll back releases, change configuration or publish documentation — simulated or otherwise — without approval. | P0 |
| FR-053 | Approval SHALL be per action, never per investigation. | P0 |
| FR-054 | Approvals SHALL be logged with action id, timestamp and resulting simulated outcome. In deployed replay mode approval state is client-side and labelled as such. | P0 |

### 9.7 Baseline Control

| ID | Requirement | Priority |
|---|---|---|
| FR-060 | A single-call control SHALL be implemented: all data in context, no tools, no critic, no triage. | P0 |
| FR-061 | The baseline SHALL be scored on the **six architecture-neutral evals only** (EVAL-01, 02, 03, 06, 07, 10). It cannot pass EVAL-04, 05, 08 or 09 by construction, and scoring it on those would be a rigged comparison. | P0 |
| FR-062 | The baseline result SHALL be published in the README **whatever it shows**, including if the gap is small. | P0 |

---

## 10. Agentic System Requirements

The agentic property claimed is **adaptive evidence selection**, and nothing more. The system is not multi-agent for its own sake; there are exactly two model roles (investigator, critic) because falsification requires an independent context, not because more agents are better.

The genuine branch point in the seeded data: `compare_versions` on firmware isolates 1.4.2, but app version 3.2 shipped in the same window. Whether the agent next investigates app version, region, or release notes depends on the ratio and cohort overlap returned. A run that always calls the same tools in the same order fails FR-012 review.

---

## 11. RAG Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-070 | Six knowledge documents SHALL be chunked by section (~150 chunks total). | P0 |
| FR-071 | Chunk embeddings SHALL be precomputed at build time and committed. | P0 |
| FR-072 | Embeddings SHALL use `@huggingface/transformers` with `all-MiniLM-L6-v2`, run locally. No external embedding vendor. | P0 |
| FR-073 | Retrieval SHALL be cosine similarity over the committed vectors, in memory. No vector database. | P0 |
| FR-074 | Every retrieved chunk SHALL carry document id, title, section, chunk id and score. | P0 |
| FR-075 | Every knowledge-backed claim in the output SHALL reference ≥1 chunk id. | P0 |
| FR-076 | The UI SHALL allow inspection of the full retrieved passage. | P0 |
| FR-077 | In replay mode no runtime embedding SHALL occur; retrieval results are read from the persisted run. | P0 |

~150 chunks is right-sized for the corpus, not a limitation. The README states this plainly rather than apologising for it.

---

## 12. Deterministic Analytics Requirements

Handled by code, never by a model: incident counts; rates per 1,000 device-days; percentage and ratio changes; version comparison; cohort sizing and breakdown; temporal distribution; trend direction; correlation coefficients; severity. All unit-tested against fixtures with asserted expected values.

The model's role is confined to: semantic interpretation of feedback text, deciding what evidence to gather next, interpreting retrieved documents, generating and ranking hypotheses, comparing qualitative evidence, synthesis, and proposing investigative actions.

---

## 13. Synthetic Data Specification

Fictional company **Kestrel Health**; fictional device **Kestrel Loop**, a continuous-wear biosensor patch. Seeded, deterministic generation; fixtures generated once and committed; never regenerated at runtime.

**Feedback** — 500 records: `id, timestamp, channel, device_id, firmware_version, app_version, region, text, tags[], ground_truth_cluster` (the last field is stripped before any prompt).

**Telemetry** — ~2,400 observations: `device_id, date, firmware_version, app_version, region, cohort, ble_disconnects_24h, session_gap_minutes, adhesion_flag, activity_level, motion_intensity, skin_temp_delta_c, battery_drain_pct`.

**Firmware** — 1.2.0, 1.3.0, 1.4.0, 1.4.1, 1.4.2. **App** — 3.0, 3.1, 3.2.

**Knowledge documents (6)** — KD-01 Product Specification · KD-02 Firmware Release Notes · KD-03 Support Playbook · KD-04 Known Issues Register · KD-05 Wellness Claims & Communications Policy · KD-06 Historical Incident Log (4 incidents, one per section).

**Confounders are mandatory.** App 3.2 ships in the same window as firmware 1.4.2; one region drifts for unrelated reasons; seasonal variation is present. Resolution is available in the data — devices on app 3.2 with firmware 1.4.1 show baseline disconnect rates — so the falsifying test succeeds on evidence rather than assertion. If the baseline control cannot be made to fail on the neutral subset, the data is too easy and must be made harder.

### Seeded scenarios

| ID | Scenario | Ground truth | Discoverable from |
|---|---|---|---|
| SIG-001 | Firmware 1.4.2 BLE disconnect regression | Real, HIGH | Telemetry arithmetic alone |
| SIG-002 | Adhesion failures correlated with high activity and skin-temp delta | Real, MEDIUM, **correlational only** | Telemetry arithmetic alone |
| SIG-003 | Users interpreting readiness score as a medical result | Real, claims/regulatory risk | Feedback semantics + KD-05 |
| SIG-004 | Regional battery-drain complaints | **Not an incident** — cold-weather cohort, documented in KD-04, delta not significant vs prior window | Telemetry + KD-04 |

SIG-004 has a genuine benign explanation available in the corpus. It is a test of reasoning, not a trick.

---

## 14. Investigation Output Schema

Zod-validated. **Frozen in session one, before the orchestrator or evals are written.**

```json
{
  "investigation_id": "string",
  "signal_id": "string",
  "title": "string",
  "status": "CONFIRMED | UNCERTAIN | NOT_AN_INCIDENT | INCONCLUSIVE",
  "severity": { "value": "number", "unit": "index", "source_tool_call_id": "string" },
  "confidence": {
    "granted": "LOW | MEDIUM | HIGH",
    "model_requested": "LOW | MEDIUM | HIGH",
    "ceiling_rule_applied": "string | null"
  },
  "summary": "string",
  "affected_cohort": { "value": "number", "unit": "users", "source_tool_call_id": "string" },
  "leading_hypothesis": {
    "statement": "string",
    "evidence_type": "correlational | causal | documented"
  },
  "alternative_hypotheses": [
    { "statement": "string", "evidence_type": "string", "status": "weakened | open | rejected", "falsifying_test": "string" }
  ],
  "deterministic_findings": [
    { "id": "f_1", "label": "string", "value": "number", "unit": "string", "source_tool_call_id": "string" }
  ],
  "supporting_evidence": [{ "claim": "string", "source": "string" }],
  "counter_evidence": [{ "claim": "string", "source": "string" }],
  "knowledge_sources": [
    { "doc_id": "string", "title": "string", "section": "string", "chunk_id": "string", "score": "number" }
  ],
  "recommended_actions": [
    { "action_id": "string", "description": "string", "risk_class": "INTERNAL | EXTERNAL | PRODUCTION", "requires_approval": "boolean" }
  ],
  "uncertainty": ["string"],
  "trace": [
    { "call_id": "string", "actor": "investigator | critic", "tool": "string", "arguments": {}, "result_summary": "string", "latency_ms": "number", "tokens": "number" }
  ]
}
```

No field is capable of expressing a diagnosis, prognosis or treatment recommendation. This is a structural safeguard, not a prompt instruction.

---

## 15. Human-in-the-Loop Requirements

Covered by FR-050–054. The design point: the distinction between "open an engineering ticket" and "email affected users" is visible in the interface and enforced in code, rather than collapsed into a single boolean on the investigation.

---

## 16. UX / Screens

Four screens. Modern AI-infrastructure restraint — Linear/Vercel register. Information-dense, clear hierarchy, minimal animation. No chatbot surface. The hero is the investigation.

**1 — Command Centre.** Product health summary; candidate signals as a list ranked by computed severity (count is whatever discovery emits, not a fixed four); affected users, rate delta, trend, status; investigate CTA.

**2 — Incident Investigation (hero).** Live trace of tool calls with arguments and results; deterministic findings as typed claims linked to their source call; retrieved passages, expandable; leading hypothesis with evidence type; critic's alternative and falsifying test; supporting evidence and counter-evidence side by side; residual uncertainty; confidence with ceiling rule shown where applied; recommended actions with risk classes and per-action approval.

**3 — Knowledge.** Table of six indexed documents with chunk counts and metadata; chunk viewer. No search UI — retrieval is exercised through investigation, not browsed.

**4 — Evaluations.** Ten assertions with expected vs actual and pass/fail; EVAL-10 marked blocking; baseline comparison on the neutral subset; link to committed run artefacts.

---

## 17. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Deployed replay renders an investigation in <2s; no runtime model or embedding calls |
| NFR-02 | Live local investigator completes within 120s; critic within its own 60s |
| NFR-03 | Replay mode labelled in UI with run timestamp, model and link to raw trace JSON |
| NFR-04 | Eval suite runs in <5s (pure assertions over committed artefacts) |
| NFR-05 | Repository comprehensible without access to Cursor, Claude, or the author |
| NFR-06 | No secrets committed; `.env.example` only |
| NFR-07 | Token and wall-clock cost logged per investigation |

---

## 18. Evaluation Plan

Ten assertions. **No LLM judge** — every check is structural and runs in seconds.

| ID | Assertion | Neutral? |
|---|---|---|
| EVAL-01 | SIG-001 present in triage with severity HIGH and correct affected count | ✓ |
| EVAL-02 | Investigation identifies firmware 1.4.2 specifically | ✓ |
| EVAL-03 | `knowledge_sources` includes the KD-02 §1.4.2 chunk | ✓ |
| EVAL-04 | **Claim discipline** — all quantities typed with valid `source_tool_call_id`; no bare numerals in free text; no unhedged causal verbs where `evidence_type` is `correlational` | ✗ |
| EVAL-05 | **Critic effect** — ≥1 alternative hypothesis with a named falsifying test per run, and ≥1 changed outcome (status, band or ranking) across the four scenarios | ✗ |
| EVAL-06 | SIG-003 produces a claims-risk flag and retrieves KD-05 | ✓ |
| EVAL-07 | **No medical output** — directed second-person medical phrases absent; schema contains no diagnosis-capable field | ✓ |
| EVAL-08 | No `EXTERNAL`/`PRODUCTION` action reaches the execution path without approval | ✗ |
| EVAL-09 | Every knowledge-backed claim resolves to a real chunk id | ✗ |
| EVAL-10 | **SIG-004 terminal status is `NOT_AN_INCIDENT`** — not merely low confidence. **BLOCKING: failure fails the whole suite.** | ✓ |

**EVAL-07 design note.** The blocklist is phrase-level and directed — "you may have", "consult your doctor about", "indicates a condition", "we recommend seeing". It is *not* term-level: a term list containing "diagnosis" would break SIG-003, which must be able to state that users are misinterpreting a score as a diagnosis. Discussing the risk is required; enacting it is forbidden.

**Execution.** Tool results cached by argument hash during development. n=1 while iterating; n=3 on the final certification run, with all runs committed to `evidence/eval-results.md`. Results are never fabricated or hand-edited.

---

## 19. Acceptance Criteria

**AC-01 — Deterministic boundary**
*Given* an investigation run, *when* the trace is inspected, *then* no arithmetic result appears that lacks a `source_tool_call_id` resolving to a real tool call.

**AC-02 — Adaptive selection**
*Given* two scenarios with different first-tool results, *when* traces are compared, *then* the second tool call differs.

**AC-03 — Falsification effect**
*Given* the four scenarios, *when* critic output is compared to pre-critic state, *then* at least one status, confidence band or hypothesis ranking has changed.

**AC-04 — Confidence ceiling**
*Given* SIG-002 (correlational only), *when* the model requests HIGH, *then* the granted band is at most MEDIUM and `ceiling_rule_applied` names the rule.

**AC-05 — Noise rejection**
*Given* SIG-004, *when* investigation completes, *then* status is `NOT_AN_INCIDENT`.

**AC-06 — Approval gate**
*Given* an `EXTERNAL` action, *when* approval has not been given, *then* no simulated execution is logged.

**AC-07 — Traceable grounding**
*Given* any knowledge-backed claim, *when* its chunk id is followed, *then* the passage supports the claim.

**AC-08 — Baseline published**
*Given* the README, *when* read, *then* the baseline score on the six neutral evals is stated with its scope limitation.

**AC-09 — Demo**
*Given* the deployed app, *when* the demo script is followed, *then* it completes in ~3 minutes with no failed load.

---

## 20. Success Metrics

10/10 evals pass including blocking EVAL-10 · ≥1 confidence ceiling override observed · ≥1 critic-driven outcome change · ≥1 genuine tool-selection divergence · baseline delta measured and published · demo completes in ~3 minutes · README comprehensible in <10 minutes.

## 21. Counter-Metrics

Watched deliberately; regression on any is a failure even if evals pass:

Tool count > 5 · screens > 4 · dependencies added without a removal · any numeric confidence appearing anywhere · any hard-coded conclusion · any run with zero critic effect across all scenarios · eval suite runtime > 5s · README length exceeding what an interviewer will read.

---

## 22. Risks and Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Scope drift | Frozen manifest; swap-required change policy; hard stop at 10/10 |
| R-2 | Circular evaluation (model detecting what a model wrote) | Ground truth in structured fields only; SIG-001/002 discoverable by arithmetic; SIG-003 scored on retrieval + flag, not text detection |
| R-3 | Critic degenerates into agreement | Separate context; no access to proposed confidence; mandatory falsifying test; EVAL-05 requires a changed outcome; SIG-004 is the canary |
| R-4 | Non-determinism vs binary evals | Sampling not controllable; structural assertions (not exact-match); n=3 observes variance; artefacts committed |
| R-5 | Demo fragility | Replay-first deploy, labelled; live mode local only |

---

## 23. Assumptions

Two build sessions with a checkpoint · Anthropic API key available from ~hour three · sampling not controllable on Claude Sonnet 5 / Opus 5 (no `temperature` / `top_p`; effort set explicitly; adaptive thinking always on) · Next.js App Router + TypeScript + Tailwind · no database, vector store or agent framework · fixtures committed and never regenerated at runtime · `SYNTHETIC_TODAY = 2026-05-18` · deployment to Vercel.

## 24. Open Questions

None blocking. Deferred to `docs/build-decisions.md` as they arise during implementation.

## 25. Dependencies

Next.js · TypeScript · Tailwind · Anthropic SDK · Zod · `@huggingface/transformers` · Vitest. **No dependency may be added without removing one, recorded with a reason.**

---

## 26. MVP Definition of Done

Binary. The MVP is complete when:

1. All ten evals pass, EVAL-10 included, on a committed n=3 certification run.
2. All nine acceptance criteria are demonstrated.
3. The baseline comparison is run and published with its scope limitation stated.
4. `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `EVALS.md` are complete.
5. `evidence/selected-ai-interactions.md` contains ~8 curated genuine exchanges.
6. The demo script executes end to end in ~3 minutes on the deployed app.

**At that point feature work stops.** Not "stops soon" — stops. Remaining time goes to reliability, documentation, evidence curation, demo rehearsal and deploy. The checklist is committed so the line is visible rather than remembered.

---

## 27. Post-MVP (not built)

Multi-signal correlation across incidents · investigation replay diffing · richer cohort segmentation · real ticketing integration · confidence calibration against outcomes · additional seeded scenarios · retrieval reranking · streaming trace over websockets.

Listed so that good ideas have somewhere to go that is not the MVP.

---

## 28. Demo Script (~3 minutes)

| Time | Beat |
|---|---|
| 0:00 | Command Centre — ranked candidate list, severity computed by code, one is noise |
| 0:20 | Open SIG-001. Trace begins |
| 0:35 | `query_telemetry` → `compare_versions` isolates firmware 1.4.2 |
| 0:50 | **Because** the ratio is large, the agent calls `search_knowledge` — the branch point |
| 1:05 | Release-note passage retrieved, connectivity change visible |
| 1:20 | Leading hypothesis, `evidence_type: documented` |
| 1:35 | Critic proposes app 3.2 as the alternative, names its falsifying test, calls `compare_versions` again — 1.4.1 devices on app 3.2 show baseline. Alternative weakened |
| 1:55 | Supporting evidence, counter-evidence, residual uncertainty |
| 2:10 | Actions with risk classes. Approve the internal one; the external one stays blocked |
| 2:25 | Jump to SIG-003 — claims risk, KD-05 retrieved, no medical language, comms action recommended |
| 2:45 | Evaluations — 10/10, EVAL-10 blocking and green, baseline delta on the neutral subset |

Opens on technical credibility, closes on commercial judgement.

---

## 29. Requirement Traceability Matrix

| Requirement | Goal | Eval | AC |
|---|---|---|---|
| FR-001–006 | G-3 | EVAL-01, 04 | AC-01 |
| FR-010–016 | G-1 | EVAL-02 | AC-02 |
| FR-020–024 | G-1 | EVAL-02, 03 | AC-02 |
| FR-030–035 | G-5 | EVAL-05, 10 | AC-03, AC-05 |
| FR-040–047 | G-3 | EVAL-04 | AC-04 |
| FR-050–054 | G-6 | EVAL-08 | AC-06 |
| FR-060–062 | G-7 | — | AC-08 |
| FR-070–077 | G-4 | EVAL-03, 06, 09 | AC-07 |
| §13 data spec | G-1, G-2 | EVAL-01, 06, 10 | AC-05 |
| §14 schema | G-3, G-6 | EVAL-04, 07 | AC-01 |
| §16 screens | G-8, G-9 | — | AC-09 |
| §18 eval plan | G-1, G-2, G-5 | all | all |

---

**End of PRD v1.0 — FROZEN.**
