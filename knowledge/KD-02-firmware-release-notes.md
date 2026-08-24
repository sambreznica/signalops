# Firmware and Companion Release Notes

**Document ID:** KD-02  
**Classification:** Internal — Engineering  
**Owner:** Firmware (Loop) with Companion App  
**Version:** 2026.19  
**Last revised:** 2026-05-07  
**Status:** Living notes; each heading is the note as shipped, not a later incident write-up  

These notes are contemporaneous with each train. They record what changed in the binary. They do not assign field causality to later ticket clusters.

---

## Firmware 1.2.0 (2025-11-12)

### BLE (1.2.0)

Initial generally available firmware for Loop hardware revision B. Established the BLE 5.2 peripheral role. Connection supervisor used a 4 s supervision timeout and a conservative linear retry schedule. Advertising interval 152.5 ms. Bonding stored in on-die flash. No background-role changes; the phone is always central. PHY 1M. Slave latency 0.

Known at ship: single-digit daily `ble_disconnects_24h` in mixed home/office RF. No regional radio variants. No Nordics-specific advertising table.

### Power and sensors (1.2.0)

Battery accounting used coulomb counting with a once-daily percent export. No ambient temperature compensation in firmware. Drain figures in temperate indoor wear were expected in the low teens percent per device-day. The Nordics regional offset later recorded in KD-04 was already visible in late-2025 field means; 1.2.0 did not attempt to compensate it.

`skin_temp_delta_c` path introduced as patch-site delta only. Adhesive-unrelated. This train did not touch the adhesion flag heuristic.

---

## Firmware 1.3.0 (2026-01-20)

### BLE (1.3.0)

Moved to a slightly tighter connection interval (30 ms nominal) to improve app-sync latency for the 3.1 app. Supervision timeout unchanged at 4 s. Retry backoff still linear. PHY 1M. Slave latency still 0. This is a BLE interval change, not a supervisor rewrite and not an idle-skip change.

A field cluster of disconnect tickets followed this train in February 2026. Engineering’s first reading pointed at this interval change. That reading was later withdrawn; see KD-06 INC-2025-014 (logged in 2026 despite the INC-2025 prefix — identifier freeze). **These notes do not restate that later conclusion.** At ship, 1.3.0 was described only as a latency improvement.

### Power and diagnostics (1.3.0)

No chemistry or accounting change. Nordics drain offset relative to other regions was already visible on 1.2.0 and was not addressed here. Added a ring buffer of last eight link-loss reasons for factory diagnostics. That buffer is not in the daily operations snapshot.

No change to `session_gap_minutes` accounting. Idle slave latency was not introduced until 1.4.1.

---

## Firmware 1.4.0 (2026-03-09)

### BLE (1.4.0)

Restored the 1.2.0 connection-interval table after 1.3.0’s latency experiment. Supervision timeout still 4 s. Linear retry. PHY 1M. Slave latency still 0. This was framed as “return to the well-characterised interval set,” not as a disconnect fix — 1.3.0’s field story was still open when 1.4.0 shipped.

App pairing: rejected companion builds older than 3.0.

### Power and sensors (1.4.0)

Maintenance train. Patched a rare crash in the thermistor sampling ISR. `skin_temp_delta_c` export rounding aligned to one decimal. No battery-chemistry change. No Nordics compensation. Charge LED unchanged.

---

## Firmware 1.4.1 (2026-04-14)

### BLE (1.4.1)

Adjusted the slave latency parameter from 0 to 2 so the peripheral could skip two connection events when idle. Intended to shave radio-on time. Supervision timeout remained 4 s. Packet length and PHY unchanged (1M). Connection interval table still the 1.4.0/1.2.0 set. Retry backoff still linear.

This is a BLE change. It is a small, idle-skip change. It is not a rewrite of the connection supervisor or of retry backoff. Lab soak on 40 units showed mean `ble_disconnects_24h` indistinguishable from 1.4.0 (about 1.4–1.6 events per device-day). Operators comparing later trains to 1.4.1 should treat 1.4.1 as the last train with the 4 s supervisor.

Idle-skip can be confused with a supervisor rewrite in ticket language (“it drops then comes back faster”). Capture the actual parameters: latency 2, timeout 4 s. Those are not the 1.4.2 parameters.

### Power and sensors (1.4.1)

Idle-skip was expected to recover a fraction of a percent of daily drain in pocket-still conditions. Field means did not move enough to retarget the Nordics offset in KD-04. Charge LED timing cosmetic fix. No adhesive work. `skin_temp_delta_c` path unchanged.

1.4.1 remains on a subset of the fleet that has not taken 1.4.2. It is a valid control train for radio behaviour when paired with app 3.2. The 1.4.1 + 3.2 pairing is an explicit resolver cell: app scheduler new, supervisor timing old.

---

## Firmware 1.4.2 (2026-05-06)

Shipped in the same calendar window as companion app 3.2. The two trains are independently gated; devices may run 1.4.2 with 3.1 or 1.4.1 with 3.2. Do not treat the shared calendar date as a single coupled release.

### BLE (1.4.2)

Revised BLE connection-supervisor timing: supervision timeout reduced from 4 s to 2 s. Retry backoff changed from linear to a shorter exponential cap (max delay 250 ms, previously 1 s). Idle slave latency remains 2, as in 1.4.1. PHY still 1M. Advertising interval unchanged.

The change ticket’s stated intent was faster drop detection so the companion could re-open a session before the wearer noticed a stale tile. These notes record that intent. They do not record a field outcome. Soak lab (n=40, indoor office RF) showed link-loss counts in the same band as 1.4.1. Outdoor, body-block, and commuting RF were not re-characterised for this train.

This section is the contemporaneous radio note for 1.4.2. It does not compare field `ble_disconnects_24h` across trains. It does not mention app 3.2’s scheduler except to warn that the ship date is shared.

### Power, sensors, telemetry (1.4.2)

No battery-chemistry change. No Nordics-specific radio table. Charge accounting unchanged. No change to the adhesion-flag heuristic or to `skin_temp_delta_c`. Daily export schema unchanged. Idle-skip from 1.4.1 is retained; it is not new in 1.4.2.

Operators comparing 1.4.2 to 1.4.1 should treat **radio timing** as the material firmware delta and should not fold in app 3.2 unless the cohort is actually on 3.2. The resolver cell (1.4.1 + 3.2) exists in the field.

---

## Companion app 3.0 (2025-11-12)

### Session lifecycle (3.0)

Shipped with firmware 1.2.0. First GA app. Foreground-only BLE session. No background refresh. Reconnect only when the wearer opened the app.

### Readiness chrome (3.0)

Readiness shown as a 0–100 tile with the caption “wellness indication.” Copy later tightened under KD-05 after the 2025 comms event; 3.0 as shipped is the train named in KD-06 INC-2025-002.

---

## Companion app 3.1 (2026-01-22)

### Background sync (3.1)

Added Android and iOS background refresh every 30 minutes when OS permissions allowed. Session re-open used the firmware’s existing supervisor. This is an app-side poll, not a firmware supervisor change, and not idle-skip.

BLE: no firmware API change. Some Android OEMs still killed the background worker; session gaps on those OEMs are an app/OS issue (KD-04 KI-AP-019).

### Copy (3.1)

Copy review against KD-05: readiness tooltip restated “not a medical result.” No new clinical vocabulary.

---

## Companion app 3.2 (2026-05-06)

Shipped in the same window as firmware 1.4.2. This section is the companion note. It is not a firmware 1.4.x subsection.

### Background sync (3.2)

The scheduler was rewritten. Instead of a fixed 30-minute wall-clock refresh, 3.2 uses a coalesced work queue: the app requests a BLE session when the OS grants a background processing slot, and it coalesces sensor pulls into a single radio wake. The change ticket’s stated goal was fewer radio wake-ups and better OS-policy compliance (Android 14+ / iOS 18 background budgets).

Reconnect logic now retries the GATT session twice inside one background slot before abandoning until the next slot. This is an app-side retry. It does not change firmware supervisor timing. It can still change observed `session_gap_minutes` on OEMs that grant fewer slots (overlap with KI-AP-019 and with the Iberia gap story in KD-04).

### UI and pairing (3.2)

Readiness tile unchanged in meaning. A denser history sparkline was added. No new clinical vocabulary (KD-05 review recorded 2026-05-02). Battery chrome still uses the harsh red fill below 40 % remaining (KI-UI-011).

Pairing still accepts firmware 1.4.0 through 1.4.2. No forced firmware upgrade.

Because 3.2 and 1.4.2 share a ship date, field tickets in this window are not self-explanatory as to which binary moved. Cohort splits (in particular 1.4.1 + 3.2) are the intended way to separate them.

---

## Release process notes

### Staging

Trains are signed and staged 10 % / 30 % / 100 % unless a stop-ship is called. 1.4.2 reached 100 % of the assigned cohort (one hundred devices in the current panel) within the 4–17 May 2026 operations window. 1.4.1 remains on the resolver cell and on slower rollouts.

Rollback of 1.4.2 to 1.4.1 is supported via the factory tool; it is not a user-facing toggle.

### How to read these notes

These notes are not an incident log. For closed field incidents see KD-06. For standing regional characteristics see KD-04. A BLE heading under 1.4.1 is idle-skip. A BLE heading under 1.4.2 is supervisor timing. Do not collapse them.
