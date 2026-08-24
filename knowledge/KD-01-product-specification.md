# Product Specification — Kestrel Loop

**Document ID:** KD-01  
**Classification:** Internal — Engineering / Product  
**Owner:** Hardware Product (Loop)  
**Approver:** VP Product  
**Version:** 4.6  
**Effective:** 2026-03-02  
**Last revised:** 2026-04-28  
**Applies to:** Kestrel Loop patch, firmware family 1.x, companion application 3.x  

Revision 4.6 folds in the 1.4.x radio stack description, clarifies that readiness is a wellness construct, and records Nordics as a generally available shipping region rather than a limited pilot.

---

## 1. Purpose and intended use

Kestrel Loop is a continuous-wear adhesive biosensor patch intended for adult wellness monitoring. The product records motion, approximate skin-temperature deviation at the patch site, and session continuity, and it derives a daily **readiness** score in the companion application.

Intended use is wellness self-tracking for generally healthy adults. The product is not a medical device. It is not intended to diagnose, treat, cure or prevent any disease. Readiness is a composite wellness indication. It is not a clinical finding and must not be described as one in any Kestrel-authored material (see KD-05).

The specification governs the hardware, firmware contract, companion-app contract, and the environmental envelope Kestrel claims to support. It does not authorise field diagnoses of firmware regressions; those belong in the incident process (KD-06) and the known-issues register (KD-04).

### 1.1 What this specification does not decide

Field ticket volume, cohort splits, and whether a train is a regression are operations questions. This document records the contract the device was designed to. Operators who need contemporaneous radio timings go to KD-02. Operators who need standing regional magnitudes go to KD-04.

---

## 2. Physical product

The Loop is a disposable-adhesive, rechargeable-core patch worn on the upper torso or upper arm. Nominal wear is twenty-four hours per day during a seven-day adhesive cycle, after which the wearer replaces the adhesive ring and reseats the core.

Mass is under 18 g including the ring. The enclosure is IPX4. The charging puck is USB-C and is not a medical-grade isolator. Colourways and packaging variants are cosmetic and have no bearing on radio, battery or scoring behaviour.

### 2.1 Core and ring

The rechargeable core seats magnetically in the adhesive ring. Reseat after shower or after a ring change. A loose seat can look like a radio fault (session gaps) without a firmware change. Support should check mechanical seat before escalating a connectivity cluster (KD-03).

### 2.2 Adhesive SKU

The adhesive ring is a single SKU globally. There is no climate-specific adhesive and no Nordics-only ring. High-activity wear remains an open characterisation topic and is **not** closed as expected behaviour in this specification. Lot-level peel failures are incident material (KD-06), not a spec waiver.

---

## 3. Sensing and derived signals

### 3.1 Motion and activity

A three-axis accelerometer yields `motion_intensity` on a 0–100 scale and an ordinal `activity_level` (low, moderate, high, very high). Activity is a convenience label over intensity, not an independent sensor. The firmware samples at 25 Hz during wear and downsamples to a daily summary for telemetry export.

High `motion_intensity` is a cofactor in adhesion lift characterisation (KD-04 KI-AD-007). It is not, by itself, evidence of a radio or battery defect.

### 3.2 Skin-temperature delta

`skin_temp_delta_c` is the difference between a thermistor under the patch and a short-window baseline for that device, in Celsius. It is a **local patch-to-skin delta**, not ambient air temperature, not core body temperature, and not a fever screen. Typical field values sit between about −0.4 °C and +3.2 °C. The field must not be used as a proxy for outdoor climate or for regional weather.

Regional battery stories must not be rewritten as thermistor stories. KD-04 records the checkable drain magnitudes; this specification only forbids the misuse of the delta field.

### 3.3 Session continuity

`session_gap_minutes` is the longest gap in a calendar day during which the core was not in an authenticated session with the companion app. Gaps in the 18–55 minute band are typical for brief out-of-range periods. Persistent gaps above about ninety minutes usually indicate radio, app-background, or carrier-side session accounting issues rather than a dead battery.

A geographically clustered gap inflation with normal `battery_drain_pct` is not a Loop cell defect. See KD-04 for the Iberia session-gap register entry.

### 3.4 BLE disconnects

`ble_disconnects_24h` counts link-loss events that lasted long enough for the supervisor to declare the connection down. Occasional single-digit daily counts occur on all firmware lines. Interpretation of a step-change in this counter is an operations question, not a specification claim.

Office 2.4 GHz chatter can add a small integer to the daily count on every train (KD-04 KI-RF-003). That environmental KI is not a template for a train-shaped jump.

---

## 4. Radio and firmware contract

The radio is a Nordic Semiconductor BLE 5.2 controller. The application processor runs Kestrel firmware 1.x. Advertising, connection-supervisor timing, and retry backoff are firmware-defined and have changed across the 1.4 line (see KD-02). This specification does not freeze those timings; it requires only that the device remain connectable to the current companion app major version.

### 4.1 Supervisor timing ownership

Firmware 1.4.1 remains the last line for which this specification records an unchanged supervisor interval relative to 1.4.0. Later 1.4.x notes in KD-02 supersede timing detail. Companion-app reconnect retries are **not** supervisor timing; they live in the app (KD-02 companion sections).

### 4.2 No cellular path

The patch does not perform cellular networking. Wide-area connectivity is the phone’s problem. Session-gap inflation that is geographically clustered (for example on a single mobile network) is therefore not, by itself, evidence of a Loop hardware fault.

BLE changes that mention idle-skip, slave latency, or supervision timeout are still BLE changes even when they were shipped to save power. Operators must not treat “battery-motivated radio tweak” as a drain register entry; drain is `battery_drain_pct`.

---

## 5. Power and battery

The core uses a 45 mAh lithium pouch. Daily `battery_drain_pct` in temperate indoor wear typically occupies the low teens (about 9–17 % per device-day in mixed activity). Overnight drain is a substantial fraction of that total.

### 5.1 Wear envelope

The cell chemistry is specified for storage −20 °C to +45 °C and for **wear** 0 °C to +40 °C skin-adjacent. Outdoor cold wear in Nordic climates is an acknowledged operating regime, not a misuse case. Expected regional elevation of drain in that regime is recorded in KD-04 with field magnitudes; this specification does not duplicate those figures.

### 5.2 What battery telemetry cannot show

Battery telemetry has **no ambient-temperature channel**. Operators comparing regions must not invent a temperature threshold from `skin_temp_delta_c`. Charge-puck faults present as a single-device step, not as a stable regional offset on hundreds of device-days.

---

## 6. Companion application

The Loop pairs with Kestrel Loop App 3.x on iOS and Android. App 3.2 is the current generally available line. The app owns readiness calculation, notification copy, and BLE session lifecycle including background refresh.

### 6.1 Independent gating

Firmware and app versions are independently gated. A device may run firmware 1.4.1 with app 3.2, or firmware 1.4.2 with app 3.2. The specification forbids treating “latest app” and “latest firmware” as a single release.

Background sync behaviour is an app concern. Changes to the background scheduler (see KD-02 companion notes) can alter radio wake-ups without any firmware change. Android OEM background-kill is a standing variance (KD-04 KI-AP-019), not a Nordic radio table.

### 6.2 Copy and scoring

Readiness chrome is subject to KD-05. This specification does not authorise clinical captions. App battery colour (red fill below 40 % remaining) is cosmetic UX debt (KD-04 KI-UI-011) and is not a thermal rail.

---

## 7. Readiness score

Readiness is an integer 0–100 computed on-device-day in the app from overnight motion quiescence, session continuity, and a slowly adapting personal baseline. It is a wellness indication for the wearer.

The score is not a medical test, not a diagnosis, not a prognosis, and not a treatment recommendation. UI chrome must not place the score adjacent to clinical vocabulary. Allowed and forbidden phrasing is owned by KD-05, not by this specification.

Support staff who receive tickets treating the score as a clinical result follow KD-03 (claims-misread queue) and do not argue medicine on the thread.

### 7.1 Inputs that are not clinical vitals

Motion quiescence and session continuity are engineering inputs. A low score after a radio-gap night is a continuity artefact until proven otherwise. Staff must not translate a low score into a health state.

---

## 8. Regional SKUs and shipping

Loop ships in the United Kingdom, Nordics, DACH, Benelux and Iberia. Packaging language varies; hardware, adhesive and firmware trains do not. There is no Nordics-only firmware.

### 8.1 Nordics

Nordics is a full GA region as of 2025-11. Support volume from Nordics is expected to include battery questions in cold months; those questions are routed per KD-03 and interpreted against KD-04 rather than opened as hardware incidents by default. The spec does not encode a °C gate because the operations export has no ambient field.

### 8.2 Iberia

Iberia is GA. A known elevation in `session_gap_minutes` for some Iberian carriers in spring 2026 is tracked in KD-04 and is not specified here as a Loop radio defect. Iberia drain means track UK, not Nordics.

### 8.3 DACH and Benelux

DACH and Benelux are temperate comparison regions for drain. Dense-office BLE chatter (KI-RF-003) is more often reported from these markets than from Nordics outdoor wear. Do not swap those stories.

---

## 9. Environmental and wear constraints

Sweat, high motion intensity, and elevated patch-site temperature delta together increase adhesive lift rates in characterisation. That interaction is **not** accepted as a closed, expected field outcome. Product still owes an adhesion improvement; this specification records the mechanism as open.

### 9.1 Water and heat

The device is not specified for swimming. Showering with the patch in place is allowed. Sauna and ice-bath use are outside the wear envelope. Those misuse cases are not Nordics drain and not Iberia session gap.

### 9.2 High-activity adhesion remains open

Do not read this section as permission to close high-activity lift tickets as “working as designed.” KI-AD-007 is open. A prior lot incident (KD-06) was real and contained; it does not retire the open characterisation.

---

## 10. Telemetry export

Daily device-level export to Kestrel operations includes: device id, date, firmware version, app version, region, cohort, BLE disconnect count, session gap minutes, adhesion flag, activity level, motion intensity, skin-temperature delta, and battery drain percent.

### 10.1 Fields that do not exist

The export is the contract for operations analytics. Fields not in the export — including ambient air temperature, GPS, and clinical vitals — do not exist for investigation purposes. Chamber logs from Quality are not this export.

### 10.2 Daily grain

One row is one device-day. Firmware and app are separate columns. Mixed 1.4.1 / 1.4.2 and mixed 3.1 / 3.2 in the same calendar window are expected after independent gating.

---

## 11. Related documents

- KD-02 Firmware and companion release notes  
- KD-03 Support playbook  
- KD-04 Known issues register  
- KD-05 Wellness claims and communications policy  
- KD-06 Historical incident log  
