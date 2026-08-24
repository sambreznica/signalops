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
