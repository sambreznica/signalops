# AGENTS.md — Implementation Constraints

Read this before writing any code. Read `PRD.md` for requirements.
This file is authoritative on scope. The PRD is authoritative on behaviour.

---

## The frozen manifest

These are counts, not targets. Exceeding any of them is a scope violation.

| Item | Count |
|---|---|
| Tools | **5** |
| Screens | **4** |
| Evaluations | **10** |
| Knowledge documents | **6** |
| Seeded scenarios | **3 incidents + 1 noise cluster** |
| Model roles | **2** (investigator, critic) |

**The five tools.** `query_telemetry` · `compare_versions` · `search_feedback` · `search_knowledge` · `find_similar_incidents`

There is no `get_release_notes`. Release notes are KD-02, reachable via `search_knowledge` with a document filter. Do not reintroduce it.

**The four screens.** Command Centre · Incident Investigation · Knowledge · Evaluations

---

## Architectural invariants

Violating any of these breaks the project's core argument. They are not preferences.

1. **Deterministic-first.** If ordinary code can compute it reliably, code computes it. Counts, rates, ratios, percentage changes, cohort sizes, correlations, trends and severity are code. Never a model call.

2. **Signal Triage contains zero model calls.** If a model call appears anywhere in the triage path, the architecture is broken.

3. **Typed numeric claims.** Every quantity in output is `{value, unit, source}`. Free-text fields contain no bare numerals; figures appear only as `{f_n}` references to `deterministic_findings`. The UI renders numbers from typed claims.

4. **Confidence is banded and code-capped.** `LOW | MEDIUM | HIGH`. The model proposes; code enforces the ceiling. Numeric confidence is prohibited anywhere in the codebase.

5. **The critic falsifies, it does not review.** Separate context. No access to the investigator's proposed confidence. Its prompt must never contain evaluative framing ("is this correct?", "review this"). It must produce a named falsifying test.

6. **`UNCERTAIN`, `INCONCLUSIVE` and `NOT_AN_INCIDENT` are legitimate terminal states.** Never coerce a conclusion.

7. **Approval is per action, never per investigation.** `EXTERNAL` and `PRODUCTION` actions cannot reach the execution path — simulated or otherwise — without explicit UI approval.

8. **Grounding is traceable.** Every knowledge-backed claim resolves to a real chunk id in a real document.

---

## Prohibitions

- **Do not fake tool use.** Every trace entry corresponds to a real call with real arguments and a real result.
- **Do not fake retrieval.** Real embeddings, real cosine similarity, real chunks.
- **Do not hard-code conclusions.** The agent must never receive ground-truth labels, incident names, expected firmware versions or expected answers in any prompt or in any fixture field it can read. Ground truth lives in stripped fields used only by the eval harness.
- **Do not fabricate or hand-edit eval results.** Committed artefacts come from actual runs.
- **Do not add dependencies.** The set is closed: `next`, `react`, `typescript`, `tailwindcss`, `@anthropic-ai/sdk`, `zod`, `@huggingface/transformers`, `vitest`, `tsx`. Adding one requires removing one, recorded in `docs/build-decisions.md`.
- **Do not add a database, a vector store, or an agent framework.**
- **Do not create new product surfaces**, routes or screens.
- **Do not implement P1 or P2** without explicit instruction.
- **Do not build a chat interface.**
- **Do not run `npm audit fix --force`.** Known transitive advisories in the local-inference chain are accepted and documented.

---

## Build order

Do not run ahead of this sequence. The evals exist before the agent so the agent is built against failing tests, not fitted to passing ones.

**Session one**
1. Zod output schema (`src/lib/schema`) — frozen before anything consumes it
2. Fixture generator (`scripts/generate-fixtures.ts`) — seeded, deterministic, committed
3. Deterministic analytics (`src/lib/analytics`) + unit tests with asserted values
4. Signal Triage + severity formula + unit tests
5. Chunking and embedding build (`scripts/build-embeddings.ts`) — vectors committed
6. **Eval harness written and failing** (`evals/`)
7. Stop.

**Session two**
8. Tool implementations (the five)
9. Investigation orchestrator
10. Falsification critic
11. Confidence ceiling enforcement
12. UI (four screens)
13. Baseline control
14. Iterate until 10/10

Run relevant tests after every material change.

---

## Bounds

Investigator: max 12 tool calls, 120s hard timeout. Critic: max 2 rounds, 4 tool calls, 60s — its own budget, not a share of the investigator's. Exceeding an investigator bound terminates with status `INCONCLUSIVE` and preserves tool-derived findings. The critic is not called when there is no leading hypothesis to falsify.

Sampling parameters (`temperature`, `top_p`, `top_k`) are not sent. Claude Sonnet 5 / Opus 5 reject them. Adaptive thinking is always on. Effort is set explicitly (`medium` for the investigator). Run-to-run variation exists and is not eliminated by any parameter we set.

`SYNTHETIC_TODAY = 2026-05-18`. Windows are 14 days against the prior 14.

---

## Definition of Done

The MVP is complete when:

1. Three committed cold runs are scored. **Invariants pass 3/3:** EVAL-01, 04, 07, 08, 09, 10. **Capability evals pass in a majority (2/3):** EVAL-02, 03, 05, 06. EVAL-10 is additionally blocking inside each run. The README publishes the ten pass rates; it never publishes a single `10/10`. See `EVALS.md`.
2. All nine acceptance criteria in `PRD.md` §19 are demonstrated
3. The baseline comparison is run and published with its scope limitation stated
4. `README.md`, `ARCHITECTURE.md`, `EVALS.md` are complete
5. `evidence/selected-ai-interactions.md` holds ~8 curated genuine exchanges
6. The demo script runs end to end in ~3 minutes

**At that point, stop building features.** Not "stop soon" — stop. Remaining effort goes to reliability, documentation, evidence curation and deploy.

---

## Change protocol

Scope drift happens through many small reasonable decisions, not one large one.

Any addition — a tool, a screen, a dependency, a route, an eval — requires an explicit removal of comparable scope, recorded in `docs/build-decisions.md` with the reason. If you believe something must be added, say so and wait. Do not add it and explain afterwards.

Good ideas that are not P0 go in `PRD.md` §27 Post-MVP. That section exists so they have somewhere to go that is not this build.
