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
    sampling not    │  critic (falsification)          │
    controllable,   │  semantic clustering             │
    never trusted   │  document interpretation         │
    with numbers)   │                                  │
                    └──────────────────────────────────┘
```

The model never computes a number that appears in output. It requests numbers through tools, cites the call that produced them, and in prose refers to them as `{f_n}` — never as a literal. This is enforced structurally — see §5 — not asked for in a prompt.

---

## 2. Layer map

```
src/
  lib/
    schema/        Zod contracts. Frozen first; everything else conforms.
    analytics/     Pure functions over fixtures. No I/O, no model calls.
                   Rates, ratios, cohort breakdowns, correlation, trend.
    triage/        Signal discovery + severity. Zero model calls.
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
affected_factor  = min(affected_users / (0.20 × fleet_size), 1.0)

ratio            = rate_window / rate_prior     if rate_prior > 0
                 = null                         if rate_prior = 0
delta_factor     = clamp(ratio, 1.0, 5.0) / 5.0 if ratio is not null
                 = 0                            if ratio is null
                 then, if prior_events < 5: min(delta_factor, 0.2)
                   and delta_factor_floored = true

trend_factor     = rising 1.0 | flat 0.6 | falling 0.3

consequence_weight = REGULATORY        2.0
                     SAFETY_ADJACENT   1.5
                     FUNCTIONAL        1.0
                     COSMETIC          0.5

severity_index = (0.5 × affected_factor + 0.5 × delta_factor)
                 × trend_factor
                 × consequence_weight

band = HIGH   if severity_index ≥ 0.9
       MEDIUM if severity_index ≥ 0.45
       LOW    otherwise
```

`ratio` is always the true rate ratio. It is never floored and never substituted. A single absolute rate floor cannot serve ticket incidence (~0.02) and telemetry (~10) at once; using one corrupted every ticket-based ratio.

`prior_events` (absolute count) and the Poisson CI travel with the candidate as stability. When the prior is thinner than 5 events, `delta_factor` is capped at 0.2 so a 10× swing on two tickets cannot masquerade as a saturated delta. The number stays honest; the score stays conservative.

`consequence_weight` is the reason a cluster of eleven users misreading a wellness score can outrank a loud connectivity blip. Magnitude alone is the wrong ranking for an operations tool: the expensive problems are frequently small and quiet.

`affected_factor` saturates when 20% of the observed fleet is involved. The HIGH/MEDIUM cuts are 0.9 and 0.45 so that a large FUNCTIONAL event (base 0.9 × weight 1.0) and a moderate REGULATORY event (base 0.45 × weight 2.0) are both HIGH. See `docs/build-decisions.md`.

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

Free-text fields are scanned for bare numerals and fail on match. Figures in narrative are `{f_n}` references to `deterministic_findings` ids; code substitutes the typed `{value, unit}` at display time. A reference to a missing finding is a validation failure (repair, then `INCONCLUSIVE`) — the same mechanism as an orphan `call_id`. A digit in the system's prose is unrepresentable, not discouraged. Identifiers — metric names, version strings, `KD-` / `INC-` / `KI-` ids — are names, not quantities.

The same principle extends to causal language. Each hypothesis carries `evidence_type: correlational | causal | documented`. Where it is `correlational`, the ceiling caps confidence at MEDIUM *and* the hypothesis string is checked against unhedged causal verbs. Bounding the confidence band without bounding the prose would leave the loophole open.

---

## 6. Retrieval

Six documents, chunked by section, roughly 150 chunks. Embeddings from `all-MiniLM-L6-v2` via `@huggingface/transformers`, computed at build time and committed. Retrieval is exact cosine similarity in memory.

**Why no vector database.** At 150 chunks, exhaustive cosine is exact, sub-millisecond, and has no operational surface. An ANN index would trade exactness for a speed gain that does not exist at this scale, and add a service to run. The corpus is small because a wearable company's internal knowledge base *is* small; the design is right-sized, not compromised.

Every chunk carries `doc_id`, `title`, `section`, `chunk_id` and `score`. Claims reference `chunk_id`. The Knowledge screen resolves them back to full passages, so grounding is inspectable rather than asserted.

In replay mode no embedding runs at request time — retrieval results are read from the persisted trace.

---

## 7. Investigator

A bounded tool-calling loop over the five tools. Investigator bounds: 12 tool calls, 120s. Critic bounds are separate (see §8). Exceeding a bound terminates with `INCONCLUSIVE` — it does not retry indefinitely, and a bounded failure is a legitimate answer.

`INCONCLUSIVE` means no conclusion inside the budget, not that no evidence was gathered. A bound stop templates the interpretive fields (status, leading hypothesis, confidence, recommended actions, an uncertainty entry naming the bound) and **keeps** `deterministic_findings` and `knowledge_sources` projected from in-memory tool JSON: labels from arguments (metric, window, versions), values from quantities the tool already stamped. Digit-free `result_summary` cannot reconstruct a rate; the model is not asked to label findings on this path. Empty supporting/counter-evidence and an empty hypothesis are honest about missing synthesis.

Adaptivity is only real if a different result produces a different next call. The seeded data contains a genuine branch point: firmware 1.4.2 and app 3.2 shipped in the same window, so isolating firmware requires noticing the confound and testing it. Devices on firmware 1.4.1 with app 3.2 show baseline disconnect rates — the confound resolves against evidence, not assertion. A trace that runs the same sequence regardless of results has failed FR-012 whether or not the evals pass.

Sampling is not controllable on Claude Sonnet 5 / Opus 5: `temperature` and other sampling parameters are rejected. Adaptive thinking is always on. Effort is set explicitly (`medium`) rather than left at the API default (`high`). Run-to-run variation therefore exists and is not eliminated by any parameter we set.

---

## 8. Critic

Separate context. Does not receive the investigator's proposed confidence band — knowing the investigator was confident is precisely the anchor that turns a critic into an agreement machine.

**What it receives.** Leading hypothesis, typed findings, retrieved passages, supporting and counter claims, residual uncertainty, stated status, summary/title, candidate identity (tag or firmware slice key), windows, and citeable `call_id`s (ids only). It does not receive `confidence` (`model_requested`, `granted`, `ceiling_rule_applied`), the investigator's `alternative_hypotheses`, or the full investigator trace (arguments / `result_summary`). Seeing the trace would reveal unchecked branches; it would also replay the investigator's search path. Gaps remain visible in the evidence table; the critic can still call tools.

Its objective is falsification, never review. Its prompt contains no evaluative framing. It must produce at least one alternative hypothesis and at least one **named falsifying test**: a specific observation that would disprove the leading hypothesis. It may call tools to run that test, under its own budget: 4 tool calls and 60s, not a share of the investigator's 12 / 120s. A shared ceiling lets a slow investigator starve the critic, which is how a falsification pass degrades into a rubber stamp.

It returns a **patch**, not a second investigation record. Code applies it: it may lower status, lower `model_requested`, or replace the leading hypothesis. It cannot raise either. The critic sees less evidence than the investigator, so it must not be able to assert more. A proposed upgrade is not dropped silently — the trace records `critic_effect` with the proposed value and the rule that blocked it, the same visibility pattern as a refused confidence band.

A bound-stopped investigation has no hypothesis to falsify (templated interpretive fields, empty alternatives). The critic is not called. The trace records `critic_effect: skipped`. Manufacturing an objection to a bound template would be theatre.

The honest test of whether this works is behavioural, not architectural: across the four scenarios, the critic must change at least one outcome. A critic that never changes anything is decorative regardless of how it is wired. The prompt does not instruct it to change outcomes.

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
- **`n=3` observes variance; it does not prove determinism.** Sampling is not controllable on this model and adaptive thinking is always on. Two cold runs of the same critic already flipped EVAL-05 and EVAL-03 (`run-critic` 8/10 with 05 red; `run-critic-2` with 05 green and 03 red). A single run does not certify. Three committed runs show how much the structural assertions move; the README reports per-eval pass rates, never a headline `10/10`. See `EVALS.md`.
- **The severity formula is a defensible guess.** It has not been validated against outcomes, because there are no outcomes. It is documented so it can be argued with.
- **The investigator's call bound is binding, not merely protective.** The first live run of `cnd_fw_1_4_2` exhausted 12 calls with a measurement-definition alternative still open, so the bound shaped the conclusion. That is honest and stays; a real operations tool has a budget too. About 8–9 of the 12 were load-bearing (ratio, hold-filters, empty-window findings, confound check, retrieval); the rest were slack, not unused slots. Raising the investigator cap would only postpone the same trade-off. The critic therefore has its own 4 calls / 60s rather than competing for leftovers.
- **The critic can weaken a finding and cannot strengthen one.** Downgrade-only is epistemic: the critic sees less evidence than the investigator, so it must not assert more. The cost is real. If the investigator dismisses a cluster as benign and the critic falsifies that dismissal, the honest revision is "it may not be benign" — and that revision is unrepresentable. A wrongly-dismissed signal stays dismissed. Refused upgrades are visible in the trace; they are not applied.
- **Retrieval quality is untested in isolation.** EVAL-03 and EVAL-09 test whether the right passage reached the conclusion, not precision and recall across the corpus.
