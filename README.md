# SignalOps

Deterministic-first operations triage for a synthetic wearable fleet. Ordinary code ranks candidate signals; a bounded agent investigates them; a separate critic tries to falsify the leading hypothesis; code caps confidence; a human approves each consequential action; approval creates a routed ticket on a board.

**All data is synthetic.** Telemetry, feedback, internal documents, incidents, and the engineer roster are fiction. This is an independent prototype, not a product of any wearable company, and it does not ingest real device data.

## Architecture

Signal Triage contains zero model calls. It computes rates, ratios, severity, and a ranked candidate list from committed fixtures. An investigator then chooses among five tools (`query_telemetry`, `compare_versions`, `search_feedback`, `search_knowledge`, `find_similar_incidents`) with no scripted sequence — the next call depends on the last result. A critic, in a separate context and without the investigator's proposed confidence band, must name a falsifying test. A pure function then writes `granted` and may refuse a higher band. EXTERNAL and PRODUCTION actions cannot execute, even in simulation, without per-action approval. Past that gate, a skills assessor names expertise; code assigns queue, engineer, priority, and SLA. The Board is where that work is operated.

## Three model roles, and the line

| Role | May | Must not |
|---|---|---|
| Investigator | Choose tools, write hypotheses, request a confidence band | Compute a number that appears in output; write `granted`; self-certify approval |
| Critic | Name a falsifying test; weaken a claim | See the investigator's requested band; raise status or confidence; invent tool results |
| Skills assessor | Name `skills_required[]` for an approved action | See the roster, WIP, priority, SLA, or engineer names |

Everything else is code: counts, rates, severity, the confidence ceiling, the approval gate, overlap rank, WIP, ticket priority, SLA. If ordinary code can compute it reliably, a model does not. The model never computes a number that appears in output; figures in prose are `{f_n}` references to typed findings.

## Evaluations

A single run is a sample. The README publishes **per-eval pass rates across committed agent runs**, not a suite headline. EVAL-10 is blocking inside each run: if noise is called an incident, that run fails regardless of the other nine.

Committed agent artefacts, oldest to newest: `run-eval04`, `run-critic`, `run-critic-2`, `run-ceiling`, `run-ceiling-2`, `run-ceiling-3`, `run-board-1`.

| Eval | Rate | Notes |
|---|---|---|
| EVAL-01 | 7/7 | Anomaly represented in triage |
| EVAL-02 | 7/7 | Firmware 1.4.2 identified |
| EVAL-03 | 6/7 | KD-02 §1.4.2 retrieved (`run-critic-2` failed) |
| EVAL-04 | 7/7 | Claim discipline (invariant) |
| EVAL-05 | 5/7 | Critic changed an outcome (`run-eval04`, `run-critic` failed) |
| EVAL-06 | 4/7 | Claims risk + KD-05 (weakest capability eval) |
| EVAL-07 | 7/7 | No directed medical output (invariant) |
| EVAL-08 | 7/7 | Approval gate (invariant) |
| EVAL-09 | 7/7 | Knowledge claims resolve (invariant) |
| EVAL-10 | **7/7 blocking** | Noise rejected as `NOT_AN_INCIDENT` |

Default replay is `run-board-1`. Older runs stay committed so these rates remain visible. See `EVALS.md`.

## Baseline comparison

A single model call, all data in context, no tools, no critic, no triage ids. Scored on EVAL-01, 02, 03, 06, 07, 10 only. EVAL-04, 05, 08, 09 are unpassable for that control by construction and are not scored. EVAL-01 still uses live triage (the assertion has no investigation-shaped equivalent).

Committed result (`runs/run-baseline.json`, `claude-sonnet-5`, n=1): **5/6**. EVAL-02 FAIL — trace is empty, so firmware cannot be pinned by a tool call (findings did name 1.4.2). EVAL-01, 03, 06, 07, 10 PASS. A high score on retrieval and noise-rejection from a dump of the corpus is a finding about the fixtures, published rather than buried. Scope is printed on every baseline line in `evidence/eval-results.md`.

## Known limitations

These are load-bearing. A prototype that claims none is not credible. Full list: `ARCHITECTURE.md` §13.

- **Ticket persistence is single-browser.** `localStorage` keyed by run id. Real across refresh in that origin; not a server, not multi-operator, not synced. A deployed interviewer and a local operator do not share a board.
- **The repair budget is one.** Two different validation failures in sequence terminate `validation_exhausted` even when the second is a single token the model was never shown. Evidence is preserved; synthesis is lost. Recorded, not papered over with another slot.
- **The investigator's call bound is binding, not merely protective.** The first live firmware run exhausted 12 calls with a measurement-definition alternative still open, so the bound shaped the conclusion. Raising the cap would only postpone the same trade-off.
- **The eval suite moves run to run.** Sampling is not controllable on this model and adaptive thinking is always on. EVAL-03 and EVAL-05 have already flipped between otherwise identical cold runs. `n=3` observes that variance; it does not prove determinism.
- **Synthetic data is easier than reality.** The baseline's 5/6 is evidence of that, not a reason to hide the comparison.

## Run locally

```bash
npm install
npm test          # unit + structural tests
npm run eval      # ten assertions against the newest agent artefact
npm run baseline  # single-call control (needs ANTHROPIC_API_KEY)
npm run dev       # UI on http://localhost:3000
```

Copy `.env.example` to `.env` only if you are running an investigation or the baseline. `ANTHROPIC_MODEL` has no default in source; the id is taken from the environment. Model ids change — see Anthropic's docs.

**Replay.** The UI loads a committed run artefact. Chrome labels it `replay`. Default is `run-board-1` (four complete investigations, 11 tickets). `SIGNALOPS_RUN_ID` selects another committed agent run. Retrieval results and ticket state come from that artefact, not from a live model call. The Board's SLA clock in this mode is the run timestamp, so cards are not overdue at T0 by construction. Live wall-clock against those `due_at` values is how overdue becomes real; that is proven by a clock fixture, not by eye.

Live investigation is CLI only: `npm run investigate -- --candidate <id>`. The four screens are Command Centre, Incident Investigation, Board, Evaluations. There is no Knowledge route and no ticket-detail route.

## Documents

- [`PRD.md`](PRD.md) — requirements
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — design and the deterministic/probabilistic line
- [`OPERATIONS.md`](OPERATIONS.md) — ticketing domain
- [`EVALS.md`](EVALS.md) — the ten assertions and the baseline
- [`docs/build-decisions.md`](docs/build-decisions.md) — every scope change and why
- [`AGENTS.md`](AGENTS.md) — implementation constraints (frozen manifest)
- [`docs/demo-script.md`](docs/demo-script.md) — three-minute walkthrough against `run-board-1`
