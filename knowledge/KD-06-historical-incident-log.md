# Historical Incident Log — Kestrel Loop

**Document ID:** KD-06  
**Classification:** Internal — Operations / Quality  
**Owner:** Incident Commander rota  
**Version:** 8.0  
**Last entry closed:** 2026-03-22  
**Rule:** Each heading is one closed incident. Dates are in the past relative to 18 May 2026. Live candidate ids are not used here.

---

## INC-2025-014 — 1.3.0 disconnect cluster (initial radio hypothesis overturned)

**Opened:** 2026-02-03 (incident id frozen as INC-2025-014)  
**Closed:** 2026-02-28  
**Severity at close:** Medium, then **downgraded**  
**Trains:** Firmware 1.3.0; mixed app 3.0/3.1  
**Regions:** UK and DACH first; not Nordics-specific  

### Initial hypothesis

Engineering treated the 1.3.0 connection-interval tightening (KD-02) as the cause of a February disconnect ticket cluster. A stop-ship discussion started. The contemporaneous 1.3.0 note recorded a BLE interval change, not a supervisor rewrite. That note was treated as sufficient cause. It was not.

### What changed the reading

A hold-out set on **1.2.0** with the **same phones** showed the same disconnect burst. A second split on **Android 15 beta** versus stable OS showed the burst tracking the OS beta, not the firmware train. Packet captures showed the central (phone) dropping the link on an OS Bluetooth watchdog, not the peripheral supervisor timing out.

Idle-skip (later, 1.4.1) and supervisor-timeout shortening (later, 1.4.2) did not exist yet. This close is not a template for those later trains.

### Close

**Corrected cause:** phone OS Bluetooth stack on a beta channel. Firmware 1.3.0 interval change was **not** the cause. Stop-ship cancelled. 1.4.0 later restored the 1.2.0 interval table for latency reasons unrelated to this close (KD-02).

### Lesson

A firmware radio note in the same window is not proof. Hold-out firmware with shared phones can falsify a radio-first story. This log must not be read as a template that “the next radio note is also innocent” or that “the next radio note is guilty.” It is a template for **splitting the phone from the patch**.

---

## INC-2025-031 — Adhesive lot lift (confirmed hardware)

**Opened:** 2025-07-09  
**Closed:** 2025-08-16  
**Severity at close:** High  
**Trains:** Firmware 1.2.x; adhesive lot A19-C  

### Initial hypothesis

High-motion wearers; possible sweat interaction (same mechanism later left open as KI-AD-007). Region was mixed. Battery and radio were not in the first story.

### Evidence

Lift tickets concentrated on a two-week ship window. Lot A19-C peel strength failed retained samples. Other lots in the same firmware train did not repeat the spike. High motion was a **cofactor**, not a sufficient cause. UK gym tickets in later years (KI-UK-008) share the motion cofactor; they are not this lot.

### Close

**Confirmed incident.** Lot quarantined. Remaining A19-C replaced. Mechanism: under-cured adhesive, not firmware, not app, not region.

KI-AD-007 remains open as a **general** high-motion lift characterisation. It does not mean adhesion tickets are now benign. A new cluster still needs a lot split.

---

## INC-2024-088 — Nordics winter drain tickets (closed: not an incident)

**Opened:** 2024-12-02  
**Closed:** 2025-01-19  
**Severity at close:** Opened Medium; **closed not an incident**  
**Trains:** 1.2.0  
**Regions:** Nordics  

### Initial hypothesis

Cell defect or charger puck fault in the Nordics holiday ship. A thermal-threshold story was proposed in the war room. The operations export had no ambient field then either.

### Evidence

Regional mean `battery_drain_pct` sat ~4–5 percentage points above UK/DACH on the same firmware, stable week to week, both indoor-labelled and outdoor-labelled tickets. Sibling regions did not move. Returned cores passed capacity. Chamber work (Quality, not the operations export) showed expected pouch impedance in cold air.

The operations export then, as now, had **no ambient temperature field**. Closure used the **regional gap**, not a °C threshold. `skin_temp_delta_c` was not used as outdoor climate.

### Close

**Not an incident.** Accepted as regional characteristic. Later encoded as KI-NW-014 with current-panel magnitudes (KD-04). Replacements will show the same offset. A future **global** drain step or a **single-device** step remains a different shape.

The 2026 panel still shows Nordics means in the high teens percent versus low-teens elsewhere, both current and prior 14-day windows. That continuity is why KI-NW-014 stays standing.

---

## INC-2025-002 — Readiness screenshots as clinical results (comms)

**Opened:** 2025-09-14  
**Closed:** 2025-10-02  
**Severity at close:** High (communications / claims), not hardware  
**Trains:** App 3.0 copy  

### Initial hypothesis

Scoring bug producing “false disease flags.” Hardware and firmware were pulled into the room. They did not belong there.

### Evidence

The integer score was in-family. Wearers and a partner newsletter described the tile with clinical vocabulary Kestrel had not authorised. No firmware fault. No battery or radio correlation. Nordics drain tickets in the same season were a separate queue.

### Close

**Confirmed communications incident, not a device incident.** Copy review; KD-05 policy 3.0 issued. Scoring code not rolled back.

Template: a claims-shaped ticket cluster can be real **risk** without being a sensor defect. Cite KD-05. Do not answer with medical advice.

---

## How to use this log

### Shape, not keys

Find-similar is for **shape**: overturned radio-first story; confirmed lot; regional drain that is not an incident; claims copy. It is not a key to any live investigation id. It does not name current operations candidates.

### What not to copy forward

INC-2025-014’s overturned cause is **1.3.0 interval + phone OS**, not a later supervisor change. INC-2024-088’s close is **regional drain gap**, not an ambient °C gate. INC-2025-031 does not retire KI-AD-007. INC-2025-002 does not authorise clinical macros.
