# Critic probes

These files are **not** certification runs and **not** eval fixtures. The harness loads only `runs/*.json` (`evals/load.ts`). Nothing here is a `CertificationRun`. The input was hand-constructed; the output is a live critic pass against that input.

This is the only direct evidence that the critic can **falsify a claim the data already contradicts**, rather than merely attach a well-formed objection to a sound investigation.

## `wrong-region-firmware`

**What it probes.** Given a completed investigation whose leading hypothesis is wrong in a way the typed findings refute, does the critic move an outcome?

**What the input asserts.** Candidate `cnd_fw_1_4_2`. Status `CONFIRMED`, requested band `HIGH`. Leading hypothesis: the current-window `ble_disconnects_24h` rise is a Nordics-region characteristic independent of firmware version. Supporting claim repeats that. Findings already contradict it (rates from the committed fixtures, not invented):

- firmware 1.4.1 fleet-wide ≈ 1.54 disconnects/device-day (`{f_1}`)
- firmware 1.4.2 fleet-wide ≈ 10.53 (`{f_2}`), ratio vs 1.4.1 `{f_3}`
- firmware 1.4.2 in UK ≈ 10.07 (`{f_4}`)
- firmware 1.4.2 in Nordics ≈ 10.55 (`{f_5}`)

UK and Nordics on 1.4.2 are the same elevation. 1.4.1 is near baseline. The Nordics-only, firmware-independent claim cannot hold.

**What the critic did** (`wrong-region-firmware.output.json`): downgraded `CONFIRMED` → `UNCERTAIN`; left the leading statement and the requested band in place; named firmware 1.4.2 as the alternative; cited `{f_4}` vs `{f_5}` as the falsifying observation; wrote counter-evidence; one tool call (`search_knowledge` on KD-02). That is a status move on a claim the pack already refutes.

Run (does not write to `runs/`):

```
npx tsx probes/run-wrong-region.ts
```
