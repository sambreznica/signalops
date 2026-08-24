# Known Issues Register — Kestrel Loop

**Document ID:** KD-04  
**Classification:** Internal — Quality / Operations  
**Owner:** Quality Engineering  
**Version:** 12.4  
**Last reviewed:** 2026-05-12  
**Status:** Register of standing characteristics and open defects. Not an incident log (see KD-06).  

Identifiers are `KI-` keys. They are not investigation candidate ids and they are not live signal ids.

Field magnitudes below that cite daily telemetry use the operations export contract in KD-01 §10: `battery_drain_pct`, `session_gap_minutes`, `skin_temp_delta_c`, region, firmware, app. There is **no ambient air-temperature field** in the export. Do not write thresholds such as “below 5 °C” against field telemetry; that channel does not exist.

---

## KI-NW-014 Nordics elevated daily battery drain (standing, benign)

**Opened:** 2024-11-03  
**Status:** Accepted characteristic. No firmware action.  
**Regions:** Nordics (all cohorts). Other shipping regions are the comparison set.  
**Trains:** Present on 1.2.0 through current 1.4.x. Not introduced by 1.4.2.

### What the field export actually shows

On the 400-device operations panel, Nordics device-days in the **4–17 May 2026** window have mean `battery_drain_pct` **17.3 %** (median 17.1, 10th–90th percentile 14.5–20.1, n = 240 device-days).

The same window in United Kingdom, DACH, Benelux and Iberia clusters at **12.8–13.0 %** mean (UK 13.0 %, DACH 12.9 %, Benelux 12.9 %, Iberia 12.9 %). The Nordics offset versus UK is about **+4.3 percentage points**, or roughly **1.33×**. The generator-side offset used to build the panel is a flat **+4.5** percentage points on Nordics rows; the realised current-window gap versus UK is **+4.3 pp**.

The **prior** window 20 April–3 May 2026 is the same shape: Nordics mean **17.6 %**, other regions **12.7–13.0 %**. Nordics current/prior ratio is ~0.98. This is not a new step-up in May 2026.

Firmware 1.4.2’s own mean drain (all regions mixed) is ~14.1 %, in line with 1.4.1 (~13.9 %). The Nordics offset is regional, not a 1.4.2 delta.

### What not to use as the explanation

`skin_temp_delta_c` is a **patch-site delta**, not outdoor temperature. In the 4–17 May window Nordics mean delta is **1.35 °C** versus UK **1.31 °C**. Correlation with `battery_drain_pct` on Nordics device-days in that window is about **0** (−0.04). Do not claim the thermistor “proves cold.” Do not set an ambient °C gate. The export cannot support it.

Lab characterisation (2024, environmental chamber, not in the operations export) showed lithium pouch impedance rising in cold air, which is why Quality accepted a **regional** offset for Nordics outdoor wear. That chamber work is the engineering rationale. The **checkable** field fact is the stable ~4.3–4.5 pp regional gap on `battery_drain_pct`.

### Handling

Tickets that match “Nordics + drain in the high teens percent + no week-on-week step” stay on this KI. They are not, by themselves, an incident. Replacement cores will show the same offset.

A **step-change** on a single device, or a global (all-region) drain step coinciding with a firmware train, is **not** this KI.

Related playbook: KD-03 battery queue. Related spec: KD-01 §5. Related close: KD-06 INC-2024-088.

---

## KI-IB-022 Iberia session-gap inflation (open — monitoring)

**Opened:** 2026-05-05  
**Status:** Open. Not accepted as Loop hardware.  
**Regions:** Iberia only.  
**Window:** Visible in the 4–17 May 2026 export; not in 20 April–3 May.

### Field magnitudes (Iberia)

Iberia mean `session_gap_minutes` in 4–17 May 2026 is **~130 minutes** versus **~36 minutes** in UK, Nordics, DACH and Benelux (n = 240 device-days per region). Prior-window Iberia was ~36 minutes, in line with peers.

BLE disconnect means in Iberia current (~3.9) are not an Iberia-specific outlier relative to DACH/Benelux in the same window; those means are dominated by the 1.4.2 mix, not by region. Battery drain in Iberia is **not** elevated (12.9 %, same as UK).

### Working hypothesis (Iberia)

Carrier-side session accounting / app background policy on a subset of Iberian Android OEMs after app 3.2 began rolling, or a network-side idle timeout. **Not** classified as a Loop battery defect and **not** merged into KI-NW-014.

Do not close this as benign Loop behaviour yet. Do not treat it as evidence that Nordics drain is “just another regional glitch of the same kind.” Different field, different window, different region.

---

## KI-AD-007 Adhesion lift under high motion (open)

**Opened:** 2025-06-18  
**Status:** Open defect. Not an accepted characteristic.  
**Regions:** All.

### Mechanism (adhesion)

Lift rates rise when `motion_intensity` is high and `skin_temp_delta_c` is elevated (characterisation: intensity ≥ 70 with delta ≥ 1.5 °C). This remains an **open** adhesive-design item. Support must not tell wearers it is expected (KD-03). Quality has not closed a hardware lot since 2025-08 (see KD-06 INC-2025-031 for a prior lot that **was** a real incident and was contained).

### What this KI is not

This KI must not be used to wave away a new adhesion cluster. It is a placeholder for an unfixed mechanism, not a benign regional story. It is not Nordics drain. Sweat-plus-motion in DACH gyms is the same open mechanism, not a climate-SKU gap.

---

## KI-UI-011 App battery chrome reads as “overheating” (standing, cosmetic)

**Opened:** 2025-09-02  
**Status:** Accepted UX debt. App 3.x still uses a harsh red fill below 40 % remaining.  
**Regions:** All.

### Presentation

Wearers, especially in Nordics where remaining percent hits the red fill earlier in the evening because of KI-NW-014, tag tickets with overheating language. The core temperature rail is not in the operations export. Do not promote these tickets to a thermal incident without a separate hardware trace.

Often co-tagged with battery tickets. Split tags; do not let chrome language drive a thermal investigation. App 3.2 did not change this fill (KD-02 companion 3.2 UI note).

---

## KI-RF-003 Dense-office BLE chatter (standing, minor)

**Opened:** 2025-02-11  
**Status:** Accepted environmental.  
**Regions:** All, indoor open-plan. Reported most from DACH and Benelux offices.

### Magnitudes (office RF)

Single-digit extra `ble_disconnects_24h` in 2.4 GHz-noisy offices on all firmware trains. Distinct from a train-specific step to double-digit daily counts. 1.4.1 lab mean remains ~1.5/day; do not cite this KI to explain a 1.4.2-shaped jump.

1.4.1’s idle-skip BLE change did not retarget this KI. Office chatter is environmental, not a supervisor rewrite.

---

## KI-AP-019 Android OEM background kill (standing)

**Opened:** 2026-01-28  
**Status:** Accepted OS variance.  
**Trains:** App 3.1 and 3.2.

### Interaction with other entries

Some Android OEMs discard the background worker, inflating `session_gap_minutes` without a firmware change. Can co-occur with app 3.2’s scheduler rewrite (KD-02) and with KI-IB-022. Split by OEM and by firmware (1.4.1 vs 1.4.2) before blaming the radio supervisor.

This KI is not Nordics drain. A killed worker leaves the cell full.

---

## KI-UK-008 UK gym sweat lift (open, regional flavour of KI-AD-007)

**Opened:** 2025-10-21  
**Status:** Open. Not a separate root cause from KI-AD-007; tracked because UK indoor-training tickets cluster in autumn.

UK high-activity lift tickets concentrate on weekday evenings. Same open adhesive mechanism: high `motion_intensity` plus elevated patch-site delta. Not a UK-only firmware. Not a battery story. Do not close as expected.

---

## KI-BE-012 Benelux commute body-block (standing, minor)

**Opened:** 2025-04-03  
**Status:** Accepted environmental.  
**Regions:** Benelux commuting wear.

Brief extra disconnects when the phone is in a bag on the far side of the body. Counts stay single-digit. Distinct from a firmware supervisor step. Mentioned so radio tickets from Benelux are not auto-merged into a train story.

---

## Register hygiene

Close a KI only with a field magnitude and a train or region that operations can recompute from the export. Narrative without numbers is a story, not a register entry. KI-NW-014 is the template: regional means, comparison regions, current versus prior window, and an explicit non-field (ambient °C).

Do not invent ambient thresholds. Do not close KI-AD-007. Do not fold Iberia session gap into Nordics drain.
