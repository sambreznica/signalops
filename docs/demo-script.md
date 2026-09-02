# Demo script — ~3 minutes against `run-board-1`

Replay artefact: `runs/run-board-1.json` plus `runs/run-board-1.tickets.json`. Chrome already says `replay`. Do not regenerate data. Do not run a live investigation.

All timings are talk-track, not loading.

---

**0:00 — Command Centre (~20s)**

Open `/`. Thirteen ranked candidates, not a tidy four. Firmware `cnd_fw_1_4_2` is HIGH. Skin-irritation, claims-interpretation, and overheating are in the list with unremarkable neighbours around them. Point at the ranking: this page is triage, zero model calls.

**0:20 — Firmware investigation, including the confound (~50s)**

Open `cnd_fw_1_4_2`. Status is UNCERTAIN, not CONFIRMED. Headline comparison is the disconnect-rate pair (current vs comparator, same unit).

Scroll the trace. The agent compared 1.4.2 to 1.4.1, then checked app version: every sampled device on both trains is on app 3.2, so the firmware difference is not an app-3.2 confound. That check was not in the prompt. The leading hypothesis is correlational: the 1.4.2 supervisor-timing change is associated with a large rise in counted disconnects, while `session_gap_minutes` (time actually lost) is not significantly different — so the count may be detection sensitivity, not proportional user impact.

**1:10 — Critic changes an outcome (~20s)**

Still on this record. Trace contains `critic_effect: leading_replaced`. The critic did not rubber-stamp. Pre-critic and post-critic leading statements differ: the pre-critic form named the shorter supervision timeout and retry backoff cap; the applied leading is the shorter statement. Status stays UNCERTAIN: the critic can weaken; it did not promote this to CONFIRMED.

**1:30 — Ceiling refuses a band (~25s)**

Navigate to `cnd_tag_overheating`. Display status `NOT_AN_INCIDENT`, note “no action needed”, no duplicate status chip. Confidence: model asked HIGH, code granted MEDIUM, rule `unrebutted_counter_evidence`. Trace shows `ceiling_applied` with those three fields. The model does not write `granted`.

**1:55 — Approval creates a ticket (~20s)**

On the firmware record, recommended actions sit behind the approval gate. Approving an EXTERNAL/PRODUCTION action is what mints a ticket — not the investigation finishing. Point at the inline ticket (TCK-0001, source `cnd_fw_1_4_2`) and follow it to the Board.

**2:15 — Board and one drawer (~30s)**

`/board`. Eleven tickets, all four queues, columns by status. Replay clock is the run timestamp, so nothing is overdue at T0. Open TCK-0001. Provenance in order: the ticket; WHY THIS ENGINEER (assessor skills vs code overlap/WIP/tie-break, labelled); WHERE THIS CAME FROM (status, band, ceiling if refused, hypothesis, approved action, link to the full record); activity log. If this action's investigation cited knowledge chunks, they appear here as inherited grounding — the ticket retrieved nothing.

**2:45 — Evaluations (~10s)**

`/evaluations`. Per-eval rates across committed runs, not a single-run headline. EVAL-10 marked blocking.

**2:55 — Close on the noise case (~5s)**

Back to overheating, or the EVAL-10 row. The plausible cluster terminated `NOT_AN_INCIDENT`. That is the adoption-critical result: a tool that cries wolf is ignored within a month.

Stop. Do not open Knowledge — the route is gone. Do not invent a live ticket. Do not claim a suite `10/10`.
