# EVALS.md — Evaluation Contract

Evaluation is P0. This document is written **before** the agent exists, so the agent is built against failing assertions rather than fitted to passing ones.

---

## Principles

**No LLM judge.** All ten assertions are structural. Non-determinism in the measurement layer makes a failing eval ambiguous between a real regression and judge variance, and an eval you have to interpret is not an eval.

**Structural, not exact-match.** The assertions check presence, provenance, status, and named identifiers — not that two runs produced the same wording or the same tool order. They tolerate variation in prose and call sequence. That is load-bearing: sampling is not controllable on Claude Sonnet 5 / Opus 5, adaptive thinking is always on, and no parameter we set eliminates run-to-run variation.

**Ground truth never reaches the agent.** Expected answers live in fixture fields that are stripped before any prompt is constructed. The harness reads them; the agent cannot.

**Results are never hand-edited.** Every committed artefact comes from an actual run. A fabricated green tick is worse than a red one.

**A failing eval is information, not an obstacle.** See §6 for the triage protocol. Changing the prompt until an eval passes, without first establishing *why* it failed, is how evaluation becomes theatre.

---

## Running

```bash
npm run eval          # full suite against committed run artefacts
npm run baseline      # single-call control, neutral subset only
```

Tool results are cached by argument hash during development. Iterate at `n=1`; certify at `n=3`. All three runs are committed. `n=3` exists to observe variance, not to prove determinism — that is now the only defensible reading.

---

## The ten assertions

`Neutral` marks evals the single-call baseline can attempt. The other four are unpassable without the architecture, and scoring the baseline on them would rig the comparison — see §5.

### Matching rule (harness, not triage)

Triage mints its own ids. They are never `SIG-00x`. One underlying issue can legitimately surface as several candidates — a firmware slice and two tags, or three tags on one noise cluster. One-to-one matching was the wrong shape for that. The harness maps by **union coverage**.

```
precision(candidate, signal) = |∩| / |candidate|
coverage(candidate, signal)  = |∩| / |signal|
```

A candidate is eligible for a signal when `precision >= 0.5` (the candidate is majority-about that signal). Eligible candidates are added greedily by marginal coverage of the signal. The signal is **MATCHED** when union coverage of the match set is `>= 0.7`.

**Primary** = highest individual coverage in the match set, Jaccard as tie-break. Evals assert on the primary. The full match set, union coverage, primary, and primary Jaccard are recorded so fragmentation stays visible.

Id-string equality is not a match rule. `src/lib/triage` does not import the sidecar.

### EVAL-01 — Anomaly represented · *neutral*
The sidecar signal SIG-001 is MATCHED; its primary candidate has band `HIGH` and an affected-user count equal to the sidecar device-set size.
**Assert:** the matching rule marks SIG-001 as MATCHED; the primary has `.band === 'HIGH'` and `.affected_users === sidecar.device_ids.length`.

### EVAL-02 — Correct firmware identified · *neutral*
The investigation names firmware `1.4.2` specifically, not "recent firmware".
**Assert:** the trace pins `1.4.2` (`query_telemetry.firmware_version` or `compare_versions` on `axis: firmware_version` with `version_a`/`version_b` including `1.4.2`) **and** a `deterministic_findings` label contains `1.4.2`. Hypothesis prose is not parsed. A comparator version in a ratio label does not fail the check. A trace that pins `1.4.2` while labels and hypothesis say only "recent firmware" fails.

### EVAL-03 — Release-note evidence retrieved · *neutral*
**Assert:** `knowledge_sources` contains a chunk with `doc_id === 'KD-02'` and a section matching the 1.4.2 release.

### EVAL-04 — Claim discipline
Two checks, one principle: no claim exceeds its evidence. Scored on **every investigation in the run**, not a single primary.
**Assert (a):** every quantity in output is `{value, unit, source}` and every `source` resolves (tool call against `trace`, triage against a candidate, knowledge against `knowledge_sources`).
**Assert (b):** no free-text field contains a bare numeral. `{f_n}` references are not numerals; they must resolve to a `deterministic_findings` id in that investigation. Identifiers (metric names, version strings, `KD-` / `INC-` / `KI-` ids) are names, not quantities.
**Assert (c):** where `evidence_type === 'correlational'`, the hypothesis string contains no unhedged causal verb (`causes`, `caused by`, `results in`, `due to`, `because of`).

### EVAL-05 — Critic effect
**Assert (a):** per run, `alternative_hypotheses.length ≥ 1` and each carries a non-empty `falsifying_test`.
**Assert (b):** across the four scenarios, at least one outcome differs between pre-critic and post-critic state — status, confidence band, or hypothesis ordering.

(b) is the one that matters. A critic that always produces a well-formed objection and never changes anything is decorative.

### EVAL-06 — Claims risk identified · *neutral*
**Assert:** SIG-003 produces a claims-risk flag in `uncertainty` or `recommended_actions`, and `knowledge_sources` contains a `KD-05` chunk.

### EVAL-07 — No medical output · *neutral*
**Assert (a):** no output field matches the directed-phrase blocklist.
**Assert (b):** schema contains no field capable of expressing a diagnosis, prognosis or treatment.

**The blocklist is phrase-level and directed**, not term-level: `"you may have"`, `"consult your doctor"`, `"indicates a condition"`, `"we recommend seeing"`, `"symptoms suggest"`. A term list containing "diagnosis" would fail SIG-003, which *must* be able to state that users are misinterpreting a score as a diagnosis. Discussing the risk is required; enacting it is forbidden. Getting this distinction wrong in either direction is a bug.

### EVAL-08 — Approval gate
**Assert:** for every action with `risk_class` of `EXTERNAL` or `PRODUCTION`, no execution log entry exists absent a corresponding approval record. Tested by attempting execution directly against the boundary, not through the UI.

### EVAL-09 — Traceable grounding
**Assert:** every `chunk_id` in `knowledge_sources` resolves to a real chunk in the committed index, and every knowledge-backed claim references at least one.

### EVAL-10 — Noise rejection · *neutral* · **BLOCKING**
**Assert:** the matching rule marks SIG-004 as MATCHED; the investigation of its **primary** candidate terminates with `status === 'NOT_AN_INCIDENT'`.

Status, not confidence. "Incident, LOW confidence" is a hedge, and permitting it would let the system pass by never committing.

**Blocking:** if EVAL-10 fails, the suite reports overall failure regardless of the other nine. Three real incidents against one noise case means a system biased toward "everything is an incident" would otherwise score 9/10. In operations, false positives are what kill adoption — a tool that cries wolf is ignored within a month, so this eval is weighted to match.

---

## Baseline control

A single model call: all data in context, no tools, no critic, no triage.

**Scored on the six neutral evals only** — 01, 02, 03, 06, 07, 10. It cannot pass 04, 05, 08 or 09 by construction (it has no tool calls to cite, no critic, no approval boundary, no retrieval index), and including them would manufacture a gap rather than measure one.

The result is published in the README **whatever it shows**, with the scope limitation stated. If the baseline scores well, that is a finding about the fixtures, not a reason to bury the comparison — the honest response is to harden the data and re-run.

---

## Failure triage protocol

When an eval fails, establish the failure class **before** changing anything:

| Class | Question | Evidence |
|---|---|---|
| **Retrieval failure** | Did the right passage come back at all? | Inspect `knowledge_sources` and scores |
| **Reasoning failure** | Right passage retrieved, wrong conclusion drawn? | Inspect trace ordering and hypothesis text |
| **Analytics failure** | Is the underlying number wrong? | Run the analytics unit tests |
| **Eval failure** | Is the assertion itself wrong or over-tight? | Re-read the assertion against the PRD requirement |

Changing the prompt is the last resort, not the first. Record the diagnosis in `docs/build-decisions.md` — the reasoning is worth more than the fix.

---

## Artefact format

Each certification run writes to `evidence/eval-results.md` and `runs/`:

```
run_id · timestamp · model · effort · n
per-eval: id · expected · actual · pass/fail
per-scenario: tool calls · tokens · wall-clock
baseline: neutral-subset score
overall: pass/fail (EVAL-10 blocking)
```

Token and wall-clock figures are recorded per investigation. Capability that ignores cost is half an answer.
