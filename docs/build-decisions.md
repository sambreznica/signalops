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
