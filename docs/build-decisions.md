# Build Decisions

Every dependency addition or scope change is recorded here with its swap and reason.

---

## 2026-08-24 — PRD §14 schema defects (session one, item 1)

PRD §14 is frozen as a sketch. The following are defects in that sketch, not deviations from the product rules. They are recorded here before the Zod contract is written so the freeze matches FR-040–054 rather than the incomplete JSON.

No tool, screen, dependency, route, or eval is added. The swap is the sketch fields that cannot enforce the FRs they exist to serve.

### Provenance is not tool-call-shaped

**Defect.** FR-046 / ARCHITECTURE §5 required `{value, unit, source_tool_call_id}`. That assumed every quantity originates in a tool call. Severity and affected-cohort are computed by Signal Triage (zero model calls, before investigation). A required `source_tool_call_id` would force a fabricated trace entry (prohibited) or a null carve-out (unprovenanced numbers).

**Amendment.** One `Provenance` union, used by both `Quantity` and evidence items:

```
Provenance =
  | { kind: 'tool_call'; call_id: string }
  | { kind: 'triage';    signal_id: string }
  | { kind: 'knowledge'; chunk_id: string }

Quantity = { value, unit, source: Provenance }
```

`knowledge` is valid on a Quantity: a spec value cited from a document is honest provenance. EVAL-04 resolves `tool_call` against `trace[]` and `triage` against triage output. Nothing is unprovenanced.

### Evidence `source` is not free text

**Defect.** §14 typed `supporting_evidence` / `counter_evidence` as `{claim, source: string}`. EVAL-09 needs every knowledge-backed claim to reference a real `chunk_id`. A free-text `source` gives the eval no hook; a global “`knowledge_sources` is non-empty” check can pass while individual claims cite nothing.

**Amendment.** Evidence items are `{claim, source: Provenance}`. EVAL-09: every evidence item with `kind: 'knowledge'` carries a `chunk_id` present in `knowledge_sources[]`. One union, three kinds, no free-text source.

### `requires_approval` is a hole in FR-051

**Defect.** §14 put `requires_approval: boolean` on recommended actions. The model can emit `risk_class: PRODUCTION` with `requires_approval: false` and self-certify past the gate FR-051 exists to guarantee.

**Amendment.** Remove `requires_approval` from the schema. Approval is derived in code from `risk_class`: `INTERNAL` → false; `EXTERNAL` and `PRODUCTION` → true. The model does not self-certify its own gate. Extra key `requires_approval` is rejected at parse time.

### Trace is not tool-calls only

**Defect.** FR-034, FR-043 and PRD §20 require ceiling overrides and critic effects in the trace. §14’s tool-call-only array cannot represent them; the demo trace narrative depends on both. An open `tool: string` would also allow fabricated tool names.

**Amendment.** `trace[]` is a discriminated union on `kind`:

```
| { kind: 'tool_call'; call_id, actor, tool, arguments,
    result_summary, latency_ms, tokens }
| { kind: 'ceiling_applied'; requested, granted, rule }
| { kind: 'critic_effect'; effect, detail }
```

`tool` is the closed five-tool enum and exists only on `tool_call` events.

### Instrumentation vs claims (container rule, not an allowlist)

Bare numbers may exist only inside `trace[]` and `knowledge_sources[]` (system-emitted: `latency_ms`, `tokens`, `score`). Any numeric outside those two arrays must be a `Quantity`. This is a structural boundary, not a field skip-list that erodes as fields are added.

Zod validates shape. The eval harness validates that each `Provenance` resolves, where it can see triage and investigation together. No `superRefine` on investigation output for resolution — a partial check would split one rule across two places and give false assurance on the half it cannot see.

### Sketch incompleteness (not defects, tightened to the FRs)

- **FR-044:** every hypothesis carries `evidence_type: correlational | causal | documented`. Same enum on `alternative_hypotheses`. §14’s `"string"` was incomplete, not permissive.
- **AC-04 / FR-042:** `ceiling_rule_applied` is the closed nullable enum `correlational_evidence | unrebutted_counter_evidence | cohort_below_25`, not a free string.
- **Units** remain an open string (a closed enum breaks when analytics introduce a new unit).
- **No regex on free-text** in the schema. EVAL-02 vs EVAL-04b (version strings vs bare numerals) is the harness’s problem.
- **Empty `alternative_hypotheses` is valid.** `INCONCLUSIVE` must be representable. EVAL-05a asserts on completed runs only.
- **No hypothesis ids.** Leading vs alternative asymmetry is kept. EVAL-05b is a disjunction; status and band are already unambiguous.

---

## 2026-08-24 — PRD §13 fixture packaging (session one, item 2)

PRD §13 listed `ground_truth_cluster` on every feedback record. That puts signal identity in a field the rest of the record shape shares with agent-readable data — a strip miss would leak the answer.

**Amendment.** No ground-truth keys on feedback, telemetry, or device records. Membership, `is_real`, `authorial_severity`, and `claims_risk` live only in `synthetic-data/signals.json`. The harness reads that sidecar; the agent never receives the file. `strip()` still removes a closed key list if present, so a future leak fails the strip test rather than becoming prompt context.

`authorial_severity` for SIG-003 is `null` with `claims_risk: true`. Claims risk is not a severity band. SIG-003 cluster size is a plausible high-teens for a 400-device beta, not 11 (that figure was prose illustration) and not inflated past 25 to dodge FR-042.

The twelve-tag → consequence-class table is committed at `synthetic-data/tag-taxonomy.json`. Tags name subject matter; they are not ground truth. SIG-001 carries only FUNCTIONAL tags by design — it must earn HIGH from magnitude and delta, not from `consequence_weight`.

Windows are pinned: current `[2026-05-04, 2026-05-17]`, prior `[2026-04-20, 2026-05-03]`, no rows on `SYNTHETIC_TODAY`. Panel: 400 devices × 6 dates = 2400, at least one date per window. Resolver cell (firmware 1.4.1 AND app 3.2) ≥ 30 devices.

EVAL-01 is not a data-tuning target. If `severity_index` undershoots HIGH on this plausible fleet, the formula is wrong and item 4 fixes it.

No knowledge documents in this step. RATE_FLOOR and significance wait for item 3. Baseline difficulty waits for item 13.

---

## 2026-08-24 — Analytics contract (session one, item 3)

Deterministic analytics sits below triage. It never imports `synthetic-data/signals.json`, never names signal ids, never calls a model, and never implements `severity_index`.

**Denominator.** A telemetry row is one device-day. Rates are `sum(metric) / n_rows` with units `*_per_device_day`. Per-device denominators are forbidden: firmware 1.4.2 exists only in the current window, so dividing by devices instead of device-days silently shrinks a large rate ratio. PRD §12’s “per 1,000 device-days” is a display scale; it cancels in every ratio and is not applied here.

**FR-021 significance.** No boolean named `significant`, and no `ratio > 2 && n > 30`. Count metrics return a Poisson Wald interval on the log rate-ratio (`method: "poisson_wald_log_rate_ratio_unclustered"`) plus `ci_excludes_one`. Zero event counts: `ratio`, CI bounds all `null`, `ci_excludes_one` false — never `Infinity`/`NaN`. Non-count metrics (means of percents, minutes) get a mean ratio and no interval.

**Overdispersion (named, not fixed).** Rows cluster by device (3 dates per window). Device-level heterogeneity overdisperses counts relative to Poisson, so the Wald interval is **too narrow** and `ci_excludes_one` fires too readily. A GEE/mixed model is out of scope. The method name says `unclustered`; outputs include `n_devices_*` beside `device_days_*` so clustering is visible. The interval is a directional guard against calling noise a change, not an inferential claim.

**Correlation.** Point-biserial for `adhesion_flag` × interval metrics; Spearman for `adhesion_flag` × ordinal `activity_level`. Return `n_pairs` and `n_devices`. No causal field names, no decorative p-values.

**feedbackByTag** returns `consequence_class` from the taxonomy, not `weight`. Weight is a severity-formula parameter (item 4). Putting it in analytics would split the formula across layers.

**Quantity.** Analytics returns `{ value, unit }` (`Measured`). It does not import `src/lib/schema`. Tools attach `source` at item 8.

**RATE_FLOOR** remains item 4.

---

## 2026-08-24 — ARCHITECTURE §4 severity (session one, item 4)

Two defects in the original §4 formula, both independent of where any seeded signal lands.

**Defect 1 — HIGH was unreachable for FUNCTIONAL.** The blended base `(0.5 × affected_factor + 0.5 × delta_factor)` is capped at 1.0. FUNCTIONAL `consequence_weight` is 1.0. HIGH was ≥ 1.2. A FUNCTIONAL candidate could never reach HIGH, so magnitude was not an independent route to HIGH despite the section saying it was. The §4 prose example (small REGULATORY cluster outranking a loud connectivity blip) was arithmetically unreachable for the connectivity side: even saturated affected_factor and delta_factor with rising trend yield index 1.0.

Fix: HIGH ≥ 0.9, MEDIUM ≥ 0.45. Those cuts mean “large FUNCTIONAL” (base 0.9 × 1.0) and “moderate REGULATORY” (base 0.45 × 2.0) are both HIGH. They were derived from that meaning, not from a target signal.

**Defect 2 — 250 was a magic denominator.** It implied saturation at 62.5% of a 400-device fleet, which is not an operations threshold.

Fix: `affected_factor = min(affected_users / (0.20 × fleet_size), 1.0)`. Once a fifth of the observed fleet is involved, further headcount does not change the triage decision.

Guard: after wiring, every discovered candidate’s `severity_index` and band is reported. The formula must discriminate (noise low, adhesion mid, claims high on weight, connectivity high on magnitude). If everything is HIGH, the formula is still wrong.

**Triage identity.** Candidates mint their own ids (`cnd_…`). They are not `SIG-00x`. Matching is union coverage, not one-to-one: a candidate is eligible when `|∩|/|candidate| >= 0.5`; the signal is MATCHED when the greedy union covers `>= 0.7` of the sidecar. Evals assert on the primary (highest individual coverage, Jaccard tie-break). The full match set is reported because one issue legitimately fragments across tags. `src/lib/triage` does not import the sidecar.

**Candidate count.** Discovery is sidecar-blind and uncapped. PRD §16 / §28 previously said “four candidates”; that predates discovery. The Command Centre shows a ranked list of whatever discovery emits. A tidy four looks staged; a ranked thirteen with unremarkable rows around the real ones is the artefact. No top-N cap.

---

## 2026-08-24 — RATE_FLOOR removed; union matching; sidecar membership (session one, item 4 follow-up)

**Defect A — RATE_FLOOR corrupted reported ratios.** Ticket incidence sits near 0.02; telemetry rates sit near 10. Substituting `max(rate_prior, 0.05)` into the denominator turned a ~10× claims increase into 0.35. The floor was doing two jobs with one constant.

Fix: `ratio` is always `rate_window / rate_prior`, or `null` when `rate_prior` is 0. Stability travels alongside: `prior_events` and the Poisson CI. `delta_factor` may still be capped when `prior_events < 5` (`min(delta_factor, 0.2)`, `delta_factor_floored: true`). Thin priors stay conservative for the honest reason — two events is not a base rate — without distorting the number. `RATE_FLOOR` as an absolute rate constant is gone. ARCHITECTURE §4 amended.

**Defect B — one-to-one matching was the wrong shape.** SIG-004's members span battery, overheating, and app-ui. No single candidate can cover a multi-tag cluster, so a coverage-of-sidecar gate could never work. Jaccard-as-threshold had the same problem.

Fix: eligible if `|∩|/|candidate| >= 0.5`; greedy add by marginal coverage; MATCHED at union coverage `>= 0.7`; primary = highest individual coverage, Jaccard tie-break. Evals assert on the primary. Fragmentation is a reported fact, not a failure.

**Sidecar membership was inconsistent.** SIG-002/003 were ticket clusters; SIG-004 was the entire nordics region, most of whom never complained. Membership is now uniform: devices observably part of the signal in the **current** window. SIG-001 remains the 1.4.2 cohort (the observable firmware signal). SIG-002/003/004 are current-window cluster ticket devices. Only `signals.json` changes; agent-visible records are untouched. EVAL-10 still has to reach `NOT_AN_INCIDENT` on the primary — that is the hard part.

---

## 2026-08-24 — Knowledge corpus and embeddings (session one, item 5)

Six internal documents in `knowledge/`. Chunker in `src/lib/retrieval` (section headings, 800-character blank-line split). Ranker is project cosine, not Hugging Face `cos_sim`. Embeddings via `@huggingface/transformers` `Xenova/all-MiniLM-L6-v2` at build time (`scripts/build-embeddings.ts`), committed as `knowledge/embeddings.json`. No vector store. No `search_knowledge` tool in this step.

**KD-04 fixture basis (EVAL-10).** `synthetic-data/telemetry.json` has no ambient temperature. KI-NW-014 uses checkable `battery_drain_pct`: Nordics current mean 17.3 % vs UK 13.0 % (+4.3 pp, ~1.33×; generator +4.5). Prior-window Nordics 17.6 % (current/prior ~0.98). `skin_temp_delta_c` is a patch-site delta (Nordics 1.35 °C vs UK 1.31 °C; corr with drain −0.04) and is not the explanation. Near-neighbour: Iberia `session_gap_minutes` ~130 vs ~36. Adhesion (KI-AD-007) stays open.

**Chunk count (not padded).** 136 total: KD-01 33, KD-02 23, KD-03 17, KD-04 21, KD-05 22, KD-06 20. ~150 in the PRD is a size check, not a target. Discrimination comes from near-neighbour sections (1.4.1 BLE idle-skip vs 1.4.2 supervisor; companion 3.2 as a sibling; other regional KIs), not filler.

---

## 2026-08-24 — Eval harness (session one, item 6)

Ten structural assertions in `evals/`. No investigation artefacts yet. First `npm run eval` is expected **1 pass / 9 fail**, overall **FAIL** because EVAL-10 is blocking.

**Artefact.** `runs/<run_id>.json` is a `CertificationRun`: investigations keyed by triage `candidate_id` (never `SIG-00x`), post-critic `output`, optional `pre_critic`, `approvals`, `execution_log`. The harness maps sidecar ids via `unionCoverageMatch`. Session two writes these; this step does not stub them.

**EVAL-07.** Directed phrases only, on system voice (`summary`, hypothesis statements, `uncertainty[]`, action descriptions). No quote exemption. Evidence claims may hold KD-05 policy text. `diagnosis` is not banned.

**EVAL-04c.** Causal verbs only on correlational hypothesis statements. Noun “cause” in KD-06 is not a hit.

**Baseline.** `npm run baseline` scores EVAL-01, 02, 03, 06, 07, 10 only and prints that scope. EVAL-01 uses live triage (the assertion has no investigation-shaped equivalent). EVAL-04/05/08/09 are not scored.

---

## 2026-08-25 — Five tools (session two, item 8)

Wrappers in `src/lib/agent/tools`. No orchestrator. No critic. No UI. No `ANTHROPIC_MODEL`. Descriptions are operational; they do not name a firmware version, a regression, or a signal id.

**JSON schemas.** Hand-written Anthropic `input_schema` objects. Zod parsers in `args.ts` share the same required-key arrays; a parity test rejects a missing key on both sides. `zod-to-json-schema` is not added (Zod 4.4.3 has no `toJSONSchema` here, and the dependency set is closed).

**Window.** `current` | `prior` only, required on `query_telemetry`, `compare_versions`, and `search_feedback`. Omitting it is `{ ok: false, error }` plus a trace event, not a silent current-window default. Results include `window_resolved: { label, start, end }`.

**Caps in code.** Feedback sample 5, text 240 characters. Knowledge `k` default 5, clamped 1–8. Similar incidents top 3. `compare_versions` requires `axis`. `query_telemetry` returns aggregates and at most one breakdown dimension, never per-device rows. `ci_excludes_one` is the interval flag; there is no field named `significant`.

**Sample denominators.** `search_feedback` returns `n_matched`, `sample_size`, and `sampled_from` (the last two are 5 of n, not 5 of 5). Selection is deterministic: matches ordered by timestamp then id, then evenly spaced so the sample spans the window rather than clustering on the first records (`selection: evenly_spaced_by_timestamp`). `find_similar_incidents` returns `returned` and `corpus_size` (3 of 4 on this corpus) so the top-3 cap is visible. Incidents are grouped from KD-06 `## INC-…` headings and ranked by max chunk cosine (`selection: top_k_by_max_chunk_cosine`).

**Empty vs filtered-to-nothing.** `query_telemetry` / `compare_versions` return `n_devices_in_window`, `n_devices_before_metric`, and `empty_reason`: `filter_matched_no_devices` when the filter cohort is empty, `no_events` when the cohort is non-empty and the metric sums to zero. Those are different next moves; collapsing both to `n_devices: 0` would make `INCONCLUSIVE` indistinguishable from a bad query.

**Provenance.** `invoke` mints `call_id`. `asQuantity` is the only `Measured` → `Quantity` path. The matching `trace` `tool_call` event is emitted on success and on parse failure. Tests use `tc_test_1`.

**MiniLM.** `search_knowledge` and `find_similar_incidents` take an injected `embedQuery`. The encoder is `Xenova/all-MiniLM-L6-v2` (mean pool, normalize) — a frozen query encoder, not the investigator. Unit tests inject stored index vectors and do not load the model. Query-time vectors are not bit-identical across hardware; ranking is over the committed index. Cosine is the project function, not Hugging Face `cos_sim`.

**Eval.** Item 8 alone does not produce investigation artefacts. The harness remains 1/10, EVAL-10 blocking.

---

## 2026-08-25 — Investigation orchestrator (session two, item 9)

Bounded native-SDK loop in `src/lib/agent/investigator.ts`. CLI: `npm run investigate -- --candidate <id> [--run-id <id>] [--no-cache]`. No critic, no ceiling, no UI. `ANTHROPIC_MODEL` is read from the environment with no default; unset exits naming the variable. `.env.example` holds an empty key and a pointer at Anthropic's model docs.

**Prompt.** Operational standards only. Structural leak test: the system prompt matches no `/\d+\.\d+(\.\d+)?/`, plus a word list. `buildUserMessage` for tag candidates has the same regex constraint. Firmware candidates may contain the slice key; a test asserts that field is the only exemption. Float rates are not inlined in the user message (they would look like version strings); integer affected-user and prior-event counts are. The agent re-queries rates with tools.

**granted.** The frozen schema required a non-null band. That is the `requires_approval` shape: if the investigator writes `granted = model_requested`, a missing ceiling silently keeps the model's band. Amendment: `granted` is `LOW | MEDIUM | HIGH | null`. The investigator is the sole writer of `model_requested` and always stamps `granted: null` and `ceiling_rule_applied: null`. Item 11 is the sole writer of `granted`. A missing ceiling is then visible (`granted` stays null), not an invisible pass. `makeInvestigation` fixtures used in eval unit tests may still set a band.

**Cache.** `runs/tool-cache.json` (gitignored), keyed by SHA-256 of canonical `(tool, args)` plus a telemetry/feedback/embeddings fingerprint. Hits still emit a real trace event (`cache_hit` on the summary). `InvestigationRecord.metrics` now includes `cache_hits` and `cache_misses` so a cold n=3 certification is distinguishable from iteration.

**Trace.** Code-owned. Model-supplied `trace` is overwritten. Empty and error tool calls stay. Orphan `call_id`s and unknown `chunk_id`s are repair-triggering validation failures, then `INCONCLUSIVE`. Digit-free `result_summary` so EVAL-04b can pass on a real trace; counts remain in the tool JSON.

**Artefact.** One candidate per invocation. `--run-id` merges into `runs/<id>.json` (`n: 1`, `kind: "agent"`, `pre_critic: null`). Four sequential calls with the same run id produce the four-primary file the harness loads. Do not mix models in one file.

**EVAL-10.** Not prompt-fitted. A first real `UNCERTAIN` on the SIG-004 primary is diagnosed under EVALS.md (retrieval / reasoning / eval) before anything is changed.

**Eval.** Item 9 makes EVAL-02, 03, 04, 06, 07, 09 reachable once the right primaries are in the newest run. EVAL-05 stays red (no critic). EVAL-08 stays red (no approval). EVAL-10 likely still red (blocking) until a real `NOT_AN_INCIDENT`. Overall FAIL until then. No fabricated run is committed.

---

## 2026-08-25 — Sampling is not controllable (first live call)

First `npm run investigate -- --candidate cnd_fw_1_4_2 --run-id run-dev` failed before any tool ran:

```
400 {"type":"error","error":{"type":"invalid_request_error","message":"`temperature` is deprecated for this model."},"request_id":"req_011CePKZ7JzAPpKpswvNS9Ey"}
```

Model was `claude-sonnet-5`. Anthropic rejects non-default sampling parameters on Sonnet 5 / Opus 5. Adaptive thinking is always on. The API default for `effort` is `high`.

**Fix.** Do not send `temperature`, `top_p`, or `top_k`. Set `output_config.effort` explicitly to `medium`. CertificationRun records `effort` instead of `temperature: 0`. AGENTS.md, ARCHITECTURE.md §7, PRD FR-016 / §23, and EVALS.md no longer claim temperature 0.

**Why medium.** The loop is capped at 12 tool calls and 120s. `high` / `xhigh` / `max` spend thinking tokens and extra tool calls that compete with that budget. `low` would skim. Docs describe `medium` as the cost-saving step-down for agentic work that still needs a branch (hold-filters, knowledge retrieval). Expected effect versus the API default: fewer thinking tokens per turn, somewhat fewer tool calls, lower cost and wall-clock, more likely to finish inside the bound; some reduction in reasoning depth. Versus `low`: enough depth to actually compare versions and retrieve KD-02.

The 400 that followed, after temperature was removed — `messages: text content blocks must be non-empty` — was the mapper turning adaptive-thinking blocks into empty `text` blocks. Thinking and redacted-thinking blocks are now passed through unchanged (the API requires them on subsequent turns when tools are used). Empty text is dropped, not forwarded.

**What did not change.** Fixtures, analytics, triage, and retrieval over the committed index remain deterministic. The model was always the only source of non-determinism. This changes how much of it there is, not where it lives. The ten evals are structural, not exact-match; `n=3` observes that variance rather than proving it away.

---

## 2026-08-25 — EVAL-02 class (first live artefact, not yet changed)

Triage under EVALS.md, before touching the assertion or the prompt.

`runs/run-dev.json` on `cnd_fw_1_4_2`: leading hypothesis names 1.4.2 as the subject and 1.4.1 as the comparator of a rate ratio (`relative to 1.4.1`). Trace `tc_1` is `compare_versions` firmware 1.4.1 vs 1.4.2, CI excluding one. Findings labels include both versions because a ratio has two sides.

**Not retrieval.** KD-02 `BLE (1.4.2)` is in `knowledge_sources`.
**Not analytics.** The 1.4.2 vs 1.4.1 disconnect ratio is the fixture-backed comparison unit tests already pin.
**Reasoning, argued against.** A reasoning failure would be: naming 1.4.1 as a co-cause, or never identifying 1.4.2 in tools/findings and writing "recent firmware". This output does neither. The alternative that *was* weakened is app 3.2, not 1.4.1-as-cause.
**Class: eval failure.** EVALS.md EVAL-02 is "names 1.4.2 specifically, not recent firmware" and "no other version named as the cause". The implementation is `fields.includes(v)` over hypothesis statement plus finding labels. That cannot distinguish comparator from cause, so a correct ratio write fails.

**Fix applied.** Pass iff (1) the trace pins `1.4.2` via `query_telemetry.firmware_version` or `compare_versions` on `axis: firmware_version`, and (2) a `deterministic_findings` label contains `1.4.2`. Hypothesis prose is not parsed; a comparator version in a ratio label does not fail. Fixture: a trace that pins `1.4.2` while labels and hypothesis say only "recent firmware" must fail — if it passes, the assertion was relaxed rather than corrected.

---

## 2026-08-25 — Twelve-call cap on the first live run

The investigator used all 12 and still left a measurement-definition alternative open. The cap shaped the stop, not only runaway.

Per-call: 1 (ble ratio) and 2 (session_gap) are load-bearing; they were cache hits from aborted turns but would still occupy slots cold. 4 and 10 returned empty and are still load-bearing (`empty_reason` is the finding: no 1.4.2 in prior; no 3.1 on 1.4.2). 6 (similar incidents), 7 (knowledge), 9 (app breakdown on 1.4.2), 11 (firmware breakdown held at app 3.2) are load-bearing. 3 is redundant with 5 (only 5 is cited). 8 (region) is optional. 12 repeats KD-02 after 7 already returned `BLE (1.4.2)`. About 8–9 genuine, 3 slack, **zero unused slots**. A cold run of this sequence is still 12 calls; the cache does not create headroom.

Do not raise the investigator cap. A bound that never binds is not a bound. Investigator stays 12 / 120s. Critic gets its own 4 calls / 60s, recorded in `MAX_CRITIC_TOOL_CALLS` / `CRITIC_TIMEOUT_MS`. A shared ceiling lets a slow investigator starve the critic. Raising investigator to 16 would add ~4 rounds at this run's ~8s / ~8k tokens each — about +32s / +31k — and would blow 120s before the critic starts. ARCHITECTURE.md §13 records that the bound is binding.

---

## 2026-08-25 — EVAL-04 class (four-primary run-dev)

Triage under EVALS.md, before changing the assertion, the prompt, or re-running `cnd_fw_1_4_2`.

EVAL-04b fails on SIG-001's primary. Question was stale artefact (pre-`summarise()` digits in `trace[].result_summary`) vs live claim-discipline (model free text).

**Not stale.** Zero hits in `result_summary` on any of the four investigations. `summarise()` is doing its job on this artefact.

**Not retrieval / not analytics.** Provenance resolves; EVAL-04c (causal verbs) is clean.

**Not eval-over-tight as the suite failure.** Some hits are metric names (`ble_disconnects_24h` → remaining `24`) or incident/KI ids the stripper does not allow (`INC-…`, `KI-…`). Those would still be a harness conversation. They are not why the summary fails: the model restated rates, timeouts, percents, and cohort size in prose.

**Class: reasoning / claim-discipline (live).** Invariant 3. The prompt already forbids digits in free-text; the model wrote them anyway, on all four primaries. EVAL-04 only scores SIG-001, so the other three were never asserted — they did not "pass EVAL-04". Re-running firmware will not fix the system.

Code-composed `summary` was rejected: it inverts ARCHITECTURE §1 (synthesis is the model's job). The applied resolution is the next two entries, recorded separately so identifier over-tightness is not collapsed into the live defect.

---

## 2026-08-25 — EVAL-04 live claim-discipline defect (resolved structurally)

The contract asked for prose about quantities and forbade digits in that prose. Asking more firmly leaves the conflict in place.

**Resolution.** The model writes narrative containing `{f_n}` references, never literals. `deterministic_findings` carry `id` (`f_1`, `f_2`, …). Code renders `{value, unit}` from the matching finding at display time (`renderFindingRefs`). A reference to a missing finding is a validation failure — repair, then `INCONCLUSIVE` — the same mechanism as an orphan `call_id`. Bare numerals in free text are the same class of failure. A digit in the system's prose is unrepresentable.

EVAL-04 now scores **every investigation in the run**, not only SIG-001. Three violating artefacts went unscored under the old scope.

Schema: additive `id` on `deterministic_findings`. Not a new tool, screen, eval, or dependency.

---

## 2026-08-25 — EVAL-04b identifier grammar (eval over-tightness)

Distinct from the live defect. `ble_disconnects_24h`, `INC-2025-002`, `KI-NW-014`, `KD-02`, and `1.4.2` are names. The stripper already exempted versions and KD-ids; it treated metric names and incident/issue ids as numerals (`24` in `ble_disconnects_24h`, `2025` in `INC-…`).

**Class: eval failure (over-tight).** Widened to a defined identifier grammar. Tests pin that the widening does not admit a bare figure (`12`, `6.8x`, `100%`, `4s`, `22`, `ratio near 1`).

---

## 2026-08-25 — Bound wipe discarded real evidence

`INCONCLUSIVE` on the 120s bound replaced the whole output. The firmware cold run had compared 1.4.1 vs 1.4.2 (`interval_excludes_one`) and retrieved KD-02; the artefact's `deterministic_findings` and `knowledge_sources` were empty. That inverts the item-9 rule that the trace cannot tidy away what happened.

**Fix.** Bound stop templates synthesis only (status, hypothesis, confidence, actions, bound uncertainty). Findings and knowledge_sources are projected from in-memory `ToolResult` objects the loop already held. Labels come from arguments; values from stamped quantities. Digit-free `result_summary` cannot reconstruct a rate — if we only had the persisted trace we could not do this. `find_similar_incidents` is left out of findings (no incident measurement); retrieval facts come from `search_knowledge` chunks only.

Wall-clock now binds before call count on a cold firmware run (9 calls / 120s). Tool `latency_ms` summed to 267ms; first MiniLM call 245ms, subsequent 10ms and 4ms. ~99.8% of the 120s is API/thinking. Bound not raised until that is the intended constraint rather than a measurement error.

---

## 2026-08-25 — Falsification critic (item 10)

Separate context. Patch, not a second investigator. No full investigator trace; the pack is hypothesis, findings, passages, claims, status, summary. The confidence object is omitted. Bound-stopped investigations skip the critic (`critic_effect: skipped`) rather than inventing an objection to a template. `pre_critic` is a clone taken after `investigate()` returns and before `criticise` / `skipCritic`.

Downgrade-only is epistemic: the critic sees less evidence than the investigator, so it cannot assert more. A proposed status or band that would raise the claim is recorded as `critic_effect` (`status_upgrade_refused` / `band_upgrade_refused`) with the proposed value and that rule — not silently dropped. `granted` stays null until item 11.

The prompt names a falsifying test. It does not instruct the critic to change outcomes. Decorative critic = well-formed alternatives and zero EVAL-05b delta.

**EVAL-05 contract (harness matched to the written decision, not convenience).**

- EVALS.md (b): "status, confidence band, or hypothesis ordering." Item 9 made `granted` the ceiling's field (`null` until item 11). The band the critic can write is `model_requested`. The harness compared `granted`; that made the critic's natural band effect invisible. Fixed: (b) compares `model_requested`.
- Item 1: "Empty `alternative_hypotheses` is valid. `INCONCLUSIVE` must be representable. EVAL-05a asserts on completed runs only." EVALS.md (a) said "per run" without that exemption; the harness required alts on every primary. Fixed: (a) scores investigations where `bound_stopped` is not true. Artefact gained optional `bound_stopped` so the harness can see the bound without string-matching the template.

EVAL-05 itself was not changed after the two-run diagnostic. `run-critic` failed 05b (well-formed alts, no outcome delta). `run-critic-2` passed 05b (claims-interpretation `CONFIRMED` → `UNCERTAIN`). A hand-constructed probe (`probes/wrong-region-firmware`) showed the critic will downgrade a hypothesis the findings already refute. 05b's first red is variance, not a decorative critic and not an unreachable eval.

---

## 2026-08-25 — A single run does not certify

Two cold four-primary runs, same code, same prompts, sampling unset:

| | `run-critic` | `run-critic-2` |
|---|---|---|
| EVAL-03 | PASS | FAIL (firmware bound-stop, no KD-02 1.4.2 chunk) |
| EVAL-05 | FAIL (05b) | PASS (claims status downgraded) |
| EVAL-06 | PASS | FAIL (claims-risk flag absent) |
| EVAL-10 | PASS | PASS |
| Headline | 8/10 | 7/10 |

That is evidence, not a footnote. `10/10` from one artefact is a claim we cannot support. `n=3` observes this variance.

**Certification rule (Definition of Done).** Not "EVAL-10 in all three and everything else majority." Majority on EVAL-04/07/09 would certify a leaked invariant. Split:

- **3/3:** EVAL-01, 04, 07, 08, 09, 10 — deterministic, structurally gated, or blocking. A 1/3 fail is a constraint that does not hold.
- **2/3:** EVAL-02, 03, 05, 06 — reasoning and retrieval, where these two runs already moved.

EVAL-10 is still blocking *inside* each run. The README publishes the ten rates, never a suite score.

The probe stays under `probes/`. It is an artefact that the critic can falsify a contradicted claim. It is not a test fixture and never enters a `CertificationRun`.

---

## 2026-08-26 — Stop reasons (wall-clock / call cap / validation)

`bound_stopped` conflated three stops. Replaced on new writes by `stop_reason`: `completed | wall_clock | call_cap | validation_exhausted`. Legacy artefacts still parse; `recordIsCompleted` falls back to `bound_stopped`.

Validation exhaustion was the bound-wipe defect still live: claims on `run-ceiling` made five calls, then JSON failed twice, and synthesis was templated. Findings projection already ran through `inconclusive()`; the interpretive wipe (status, hypothesis, supporting/counter, actions) was the same as wall-clock, which is correct — a failed parse is not a conclusion. The defect was (1) calling that a bound, (2) not persisting the validator's reasons or the emit. `validation_error` and `validation_emit` live on the record, not in output free-text (EVAL-04).

The critic skips any `stop_reason` other than `completed`. EVAL-05a uses `recordIsCompleted`.

---

## 2026-08-26 — Wall-clock calibrated to the call budget

120s was "enough time for 12 medium turns plus synthesis" at ~8s/slot. Per-slot API+thinking on the three cold runs:

| Run | Completed ms/slot | Firmware |
|---|---|---|
| `run-critic` | 12.3s (22 slots) | 9.0s, 12 calls, then **validation** at 107.8s |
| `run-critic-2` | 12.8s (21 slots) | **12.0s**, 10 calls, **120s wall-clock** |
| `run-ceiling` | 10.8s (16 slots) | **12.0s**, 10 calls, **120s wall-clock** |

At ~12s/slot the clock silently capped the agent at ~10 calls. That is the clock overriding a bound we chose (12). Call cap stays 12. Wall-clock is 180s (12 slots + synthesis ≈ 160s, plus headroom). Critic stays 4 calls; 4 slots + synthesis at ~12s is 60s with no repair headroom, so 90s.

This is a measurement finding, not a looser agent. FR-013 / NFR-02 updated to match. Effort stays `medium`.

The 12-call bound has not been the recorded stop on any of the three runs. Firmware died on the clock twice after latency moved from ~9s to ~12s/slot.

---

## 2026-08-25 — Open: firmware primary bound-stops (item 12)

`cnd_fw_1_4_2` is the demo hero. Cold runs hit the (then 120s) wall with a templated hypothesis and skipped critic. Clock recalibrated to 180s to match the 12-call budget; the call cap is unchanged. Flag for the UI step: Incident Investigation needs distinct stop states — `wall_clock`, `call_cap`, `validation_exhausted` — each readable as "budget exhausted / repair exhausted, evidence kept," not as a finished judgement.

---

## 2026-08-25 — Confidence ceiling (item 11)

Pure function `ceilingDecision` / `applyCeiling`. Sole writer of `granted`. Runs after the critic on post-critic `model_requested`. Incomplete stops still run it.

**Unrebutted** = a `counter_evidence` claim absent from the investigator record. Cruder than the words: no rebuttal marker exists, and we will not add a model-filled one. Investigator-listed caveats do not fire the rule.

**Rule order** is FR-042: correlational, then critic CE, then cohort < 25. Live primaries are all correlational and three of four are also < 25 users, so artefacts will show `correlational_evidence` when HIGH is requested. The other two rules are unit-tested; faking an investigation to make them fire in a run would not be evidence.

**NOT_AN_INCIDENT at HIGH** is capped. The rule is about evidence type, not accusation vs dismissal. EVAL-10 is status.

Override visibility: `granted`, `ceiling_rule_applied`, `trace[].kind === ceiling_applied` with `{requested, granted, rule}`. Item 12 does not need another field.
