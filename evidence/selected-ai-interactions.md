# Selected AI interactions

Drawn only from committed artefacts. No exchange here was written up after the fact. Each entry cites its source.

---

## 1. A model-writable approval flag would have been a hole

**Source.** `docs/build-decisions.md`, 2026-08-24 — PRD §14 schema defects.

PRD §14 put `requires_approval: boolean` on recommended actions. The model could emit `risk_class: PRODUCTION` with `requires_approval: false` and self-certify past the gate FR-051 exists to guarantee.

The field was removed before implementation. Approval is derived in code from `risk_class`: INTERNAL → false; EXTERNAL and PRODUCTION → true. Extra key `requires_approval` is rejected at parse time. The model does not self-certify its own gate.

---

## 2. HIGH was arithmetically unreachable for FUNCTIONAL

**Source.** `docs/build-decisions.md`, 2026-08-24 — ARCHITECTURE §4 severity.

The blended base `(0.5 × affected_factor + 0.5 × delta_factor)` is capped at 1.0. FUNCTIONAL `consequence_weight` is 1.0. HIGH was ≥ 1.2. A FUNCTIONAL candidate could never reach HIGH, so magnitude was not an independent route to HIGH despite the section saying it was. The prose example — a small REGULATORY cluster outranking a loud connectivity blip — was unreachable for the connectivity side: even saturated factors with rising trend yield index 1.0.

Cuts moved to HIGH ≥ 0.9, MEDIUM ≥ 0.45, derived from that meaning, not from a target signal.

---

## 3. RATE_FLOOR made a tenfold cluster read as shrinking

**Source.** `docs/build-decisions.md`, 2026-08-24 — RATE_FLOOR removed; union matching; sidecar membership.

Ticket incidence sits near 0.02; telemetry rates sit near 10. Substituting `max(rate_prior, 0.05)` into the denominator turned a ~10× claims increase into 0.35. The floor was doing two jobs with one constant.

Ratio is now always `rate_window / rate_prior`, or null when prior is 0. Thin priors stay conservative via `delta_factor` cap when `prior_events < 5`, without distorting the reported number. `RATE_FLOOR` as an absolute rate constant is gone.

---

## 4. One-to-one matching could not represent a multi-tag cluster

**Source.** Same entry as 3.

SIG-004's members span battery, overheating, and app-ui. No single candidate can cover a multi-tag cluster, so a coverage-of-sidecar gate could never work. Jaccard-as-threshold had the same problem.

Matching became union coverage: eligible if `|∩|/|candidate| >= 0.5`; MATCHED at union coverage `>= 0.7`; evals assert on the primary. Fragmentation is a reported fact, not a failure. `src/lib/triage` does not import the sidecar.

---

## 5. Ground truth sat where a missed strip() would leak it

**Source.** `docs/build-decisions.md`, 2026-08-24 — PRD §13 fixture packaging.

PRD §13 listed `ground_truth_cluster` on every feedback record. That puts signal identity in a field the rest of the record shape shares with agent-readable data — a strip miss would leak the answer.

No ground-truth keys on feedback, telemetry, or device records. Membership, `is_real`, `authorial_severity`, and `claims_risk` live only in `synthetic-data/signals.json`. The harness reads that sidecar; the agent never receives the file. `strip()` still removes a closed key list if present, so a future leak fails the strip test rather than becoming prompt context.

---

## 6. Claim discipline was fixed with references, not a firmer instruction

**Source.** `docs/build-decisions.md`, 2026-08-25 — EVAL-04 live claim-discipline defect (resolved structurally).

The prompt already forbade digits in free-text. The model wrote them anyway, on all four primaries of a live run. Asking more firmly would have left the conflict in place: the contract asked for prose about quantities and forbade digits in that prose.

Resolution: the model writes `{f_n}` references; `deterministic_findings` carry the typed values; code renders them at display time. A missing finding is a validation failure — the same mechanism as an orphan `call_id`. A digit in the system's prose is unrepresentable, not discouraged.

---

## 7. A two-class repair sequence was documented rather than given another slot

**Source.** `docs/build-decisions.md`, 2026-08-26 — Repair names field and token; one slot remains. Also `ARCHITECTURE.md` §13.

One repair remains. A two-class sequence (`no_json` then `bare_numeral`) still exhausts; that is a known limitation, not a budget raise. Firmware exhibited exactly this on `run-ceiling-2`. The artefact records `validation_attempts` so the sequence is a list of classes, not one concatenated string. Evidence is preserved; synthesis is lost.

---

## 8. The investigator bound was kept because it bound

**Source.** `docs/build-decisions.md`, 2026-08-25 — bound discussion (call cap). Also `ARCHITECTURE.md` §13.

The first live run of `cnd_fw_1_4_2` exhausted 12 calls with a measurement-definition alternative still open, so the bound shaped the conclusion. About 8–9 of the 12 were load-bearing; the rest were slack, not unused slots. A bound that never binds is not a bound. The cap was not raised. The critic got its own 4 calls rather than competing for leftovers.

---

Eight entries. The first seven are the defects the build actually hit. The eighth is the scope choice that followed from watching a bound do its job.
