# ARCHITECTURE.md

How SignalOps is put together, and why it is put together this way.

`PRD.md` is authoritative on requirements. `AGENTS.md` is authoritative on scope. This document explains the design.

---

## 1. The central boundary

Everything in this system sits on one side of a line.

```
                    ┌──────────────────────────────────┐
   DETERMINISTIC    │  fixtures                        │
   (ordinary code,  │  analytics                       │
    unit-tested,    │  Signal Triage                   │
    reproducible)   │  severity formula                │
                    │  confidence ceiling              │
                    │  approval gates                  │
                    │  eval assertions                 │
                    └──────────────────────────────────┘
                                    │
                            tool interface
                                    │
                    ┌──────────────────────────────────┐
   PROBABILISTIC    │  investigator (tool selection,   │
   (model calls,    │   hypothesis generation)         │
    temperature 0,  │  critic (falsification)          │
    never trusted   │  semantic clustering             │
    with numbers)   │  document interpretation         │
                    └──────────────────────────────────┘
```

The model never computes a number that appears in output. It requests numbers through tools and cites the call that produced them. This is enforced structurally — see §5 — not asked for in a prompt.

---

## 2. Layer map

```
src/
  lib/
    schema/        Zod contracts. Frozen first; everything else conforms.
    analytics/     Pure functions over fixtures. No I/O, no model calls.
                   Rates, ratios, cohort breakdowns, correlation, trend.
    retrieval/     Chunking, embedding lookup, cosine similarity.
    agent/
      tools/       The five tool implementations. Thin wrappers over
                   analytics + retrieval. No business logic of their own.
      investigator Orchestration loop, bounded.
      critic       Falsification pass, separate context.
      ceiling      Confidence rules. Pure function. Unit-tested.
  app/             Four routes. Presentation only — no computation.

synthetic-data/    Committed fixtures. Generated once, never at runtime.
knowledge/         Six documents + committed chunk embeddings.
evals/             Ten assertions + baseline control.
runs/             Persisted investigation traces (replay source).
```

Dependency direction is strictly downward. `analytics` does not know `agent` exists. `app` computes nothing.

---

## 3. Data flow

```
fixtures ──► analytics ──► Signal Triage ──► candidate signals
                                                    │
                                          user selects one
                                                    │
                                                    ▼
                                          investigator loop
                                          ├─ query_telemetry
                                          ├─ compare_versions      each call's
                                          ├─ search_feedback       result informs
                                          ├─ search_knowledge      the next
                                          └─ find_similar_incidents
                                                    │
                                          leading hypothesis
                                                    │
                                                    ▼
                                          critic (separate context)
                                          ├─ alternative hypothesis
                                          ├─ named falsifying test
                                          └─ may call tools to test it
                                                    │
                                                    ▼
                                          confidence ceiling (code)
                                                    │
                                                    ▼
                                          validated output + trace
                                                    │
                                                    ▼
                                          approval gate (per action)
```

---

## 4. Signal Triage

Triage answers "what is worth looking at" using only arithmetic. **No model call may appear in this path.** If one does, the system's central claim is false.

Window: the 14 days preceding `SYNTHETIC_TODAY = 2026-05-18`, compared against the prior 14.

### Severity formula

```
affected_factor  = min(affected_users / 250, 1.0)

ratio            = rate_window / max(rate_prior, RATE_FLOOR)
delta_factor     = clamp(ratio, 1.0, 5.0) / 5.0

trend_factor     = rising 1.0 | flat 0.6 | falling 0.3

consequence_weight = REGULATORY        2.0
                     SAFETY_ADJACENT   1.5
                     FUNCTIONAL        1.0
                     COSMETIC          0.5

severity_index = (0.5 × affected_factor + 0.5 × delta_factor)
                 × trend_factor
                 × consequence_weight

band = HIGH   if severity_index ≥ 1.2
       MEDIUM if severity_index ≥ 0.6
       LOW    otherwise
```

`consequence_weight` is the reason a cluster of eleven users misreading a wellness score can outrank a loud connectivity blip. Magnitude alone is the wrong ranking for an operations tool: the expensive problems are frequently small and quiet.

### A design tension worth naming

`consequence_weight` is looked up from the support tag on a feedback cluster. That raises a fair question: is the answer being handed to the system in the data?

It is not, and the reason matters. The tags come from a twelve-item support taxonomy applied across all 500 records — `connectivity`, `adhesion`, `battery`, `claims-interpretation`, `app-sync`, and so on — exactly as a real support desk categorises tickets. Tags identify *subject matter*, not *truth* or *severity*. The noise cluster (SIG-004) carries the `battery` tag and is not an incident; genuine incidents and non-incidents share the tag space. No tag encodes "this is real" or "this is the seeded answer", and ground-truth fields are stripped before any prompt is constructed.

---

## 5. Claim discipline

Every quantity in output is a typed object:

```ts
{ value: number, unit: string, source_tool_call_id: string }
```

Two consequences fall out of this:

1. A number can only exist if a tool produced it. There is nowhere for a model-invented figure to live.
2. EVAL-04 becomes a mechanical check — walk the output, resolve every `source_tool_call_id` against the trace, fail on any orphan.

Free-text fields are scanned for bare numerals and fail on match. The UI renders numbers from typed claims, so prose and figures cannot drift apart.

The same principle extends to causal language. Each hypothesis carries `evidence_type: correlational | causal | documented`. Where it is `correlational`, the ceiling caps confidence at MEDIUM *and* the hypothesis string is checked against unhedged causal verbs. Bounding the confidence band without bounding the prose would leave the loophole open.

---

## 6. Retrieval

Six documents, chunked by section, roughly 150 chunks. Embeddings from `all-MiniLM-L6-v2` via `@huggingface/transformers`, computed at build time and committed. Retrieval is exact cosine similarity in memory.

**Why no vector database.** At 150 chunks, exhaustive cosine is exact, sub-millisecond, and has no operational surface. An ANN index would trade exactness for a speed gain that does not exist at this scale, and add a service to run. The corpus is small because a wearable company's internal knowledge base *is* small; the design is right-sized, not compromised.

Every chunk carries `doc_id`, `title`, `section`, `chunk_id` and `score`. Claims reference `chunk_id`. The Knowledge screen resolves them back to full passages, so grounding is inspectable rather than asserted.

In replay mode no embedding runs at request time — retrieval results are read from the persisted trace.

---

## 7. Investigator

A bounded tool-calling loop over the five tools. Bounds: 12 tool calls, 2 critic rounds, 120s. Exceeding any bound terminates with `INCONCLUSIVE` — it does not retry indefinitely, and a bounded failure is a legitimate answer.

Adaptivity is only real if a different result produces a different next call. The seeded data contains a genuine branch point: firmware 1.4.2 and app 3.2 shipped in the same window, so isolating firmware requires noticing the confound and testing it. Devices on firmware 1.4.1 with app 3.2 show baseline disconnect rates — the confound resolves against evidence, not assertion. A trace that runs the same sequence regardless of results has failed FR-012 whether or not the evals pass.

Temperature 0 throughout.

---

## 8. Critic

Separate context. Does not receive the investigator's proposed confidence band — knowing the investigator was confident is precisely the anchor that turns a critic into an agreement machine.

Its objective is falsification, never review. Its prompt contains no evaluative framing. It must produce at least one alternative hypothesis and at least one **named falsifying test**: a specific observation that would disprove the leading hypothesis. It may call tools to run that test.

It may downgrade status, downgrade confidence, or reorder hypotheses, and its effect is recorded in the trace.

The honest test of whether this works is behavioural, not architectural: across the four scenarios, the critic must change at least one outcome. A critic that never changes anything is decorative regardless of how it is wired.

---

## 9. Confidence ceiling

The model proposes a band with justification. Code then applies the ceiling:

```
HIGH is unavailable when ANY of:
  - evidence_type is 'correlational'
  - unrebutted critic counter-evidence exists
  - affected cohort < 25 users
```

Where the ceiling overrides the request, the output records `model_requested`, `granted`, and `ceiling_rule_applied`, and the UI shows the override.

The override being *visible* is the point. A system that quietly behaves well is indistinguishable from one that got lucky; a system that shows its request being refused demonstrates the constraint exists.

Numeric confidence is prohibited anywhere in the codebase. A model emitting `0.89` is performing an unjustifiable calculation — the same failure the architecture is built to prevent, wearing a decimal point.

---

## 10. Approval gates

Every recommended action carries `risk_class`:

| Class | Example | Behaviour |
|---|---|---|
| `INTERNAL` | Open an engineering investigation | Simulated on approval |
| `EXTERNAL` | Notify affected users | Blocked until approved |
| `PRODUCTION` | Roll back firmware | Blocked until approved |

Enforced at the execution boundary, not in the UI layer, so the gate cannot be bypassed by calling the function directly. Approval is per action — collapsing "open a ticket" and "email customers" into one boolean would erase the distinction that matters.

---

## 11. Replay and live modes

| | Deployed (`replay`) | Local (`live`) |
|---|---|---|
| Model calls | none | real |
| Embeddings | none | real |
| Source | persisted `runs/*.json` | executed at request time |
| Latency | <2s | up to 120s |

Replayed runs are **real executions, recorded** — not simulated tool use. Each is labelled in the UI with its run timestamp and model, and links to the raw trace JSON.

The reason is practical: an interviewer opening a cold serverless function and waiting ninety seconds for a live investigation is a worse demonstration than an instant, honest replay of a real one.

---

## 12. Rejected alternatives

Recorded because the reasoning matters more than the choice.

**Vector database.** 150 chunks. Exhaustive cosine is exact and instant; an index would add operational surface for no accuracy gain.

**Agent framework (LangGraph, CrewAI, etc.).** Two model roles and five tools. A framework would abstract away the exact mechanism the project exists to demonstrate, and its control flow would become the thing a reader has to trust rather than inspect.

**More agents.** Each additional agent needs a justification beyond sounding sophisticated. Falsification genuinely requires context separation — a critic that shares the investigator's context inherits its anchoring. Nothing else in this system required it.

**LLM-as-judge in the eval suite.** Non-determinism in the measurement layer means a failing eval is ambiguous between a real regression and judge variance. All ten assertions are structural; the suite runs in seconds and cannot be argued with.

**Numeric confidence.** Unfalsifiable precision. `0.89` implies a calibration that does not exist.

**Streaming telemetry / websockets.** Replay covers the deployed case; live local mode covers development. Neither needs streaming infrastructure.

**A sixth tool (`get_release_notes`).** Release notes are KD-02, reachable via `search_knowledge` with a document filter. A filter argument presented as a tool inflates the apparent tool count without adding a decision point — the opposite of the argument this project makes.

---

## 13. Known limitations

Stated plainly, because a prototype that claims no limitations is not credible.

- **Synthetic data is easier than reality.** Confounders are present by design, but real signal is dirtier. The baseline control exists partly to test whether the data is too easy — if a single call scores well on the neutral evals, the fixtures need hardening.
- **Four scenarios is a small eval set.** Enough to catch gross failure, not enough for calibration.
- **`n=3` at temperature 0** bounds variance observation; it does not characterise the tail.
- **The severity formula is a defensible guess.** It has not been validated against outcomes, because there are no outcomes. It is documented so it can be argued with.
- **Retrieval quality is untested in isolation.** EVAL-03 and EVAL-09 test whether the right passage reached the conclusion, not precision and recall across the corpus.
