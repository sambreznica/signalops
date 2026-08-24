# Support Playbook — Kestrel Loop

**Document ID:** KD-03  
**Classification:** Internal — Customer Support  
**Owner:** Support Operations  
**Version:** 9.2  
**Effective:** 2026-04-15  
**Last revised:** 2026-05-08  

This playbook tells staff how to classify and handle tickets. It does not decide whether a field pattern is an incident. Severity and incident status are operations outcomes (KD-04, KD-06, live investigation). Staff must not invent clinical explanations and must not reassure wearers with medical language.

Forbidden on threads (non-exhaustive): “you may have”, “consult your doctor”, “indicates a condition”, “we recommend seeing”, “symptoms suggest”. If a wearer raises a medical question, staff state that Kestrel Loop is a wellness product and that Kestrel does not provide clinical advice, then stop. Do not improvise.

---

## Queue: connectivity and app-sync

### Intake (connectivity)

Symptoms in the wearer’s words: drops, unpaired, “reopen the app”, overnight disconnect, sync tile stale.

Take: device id, firmware version, app version, region, whether the phone stayed in range, OS, whether the core was reseated.

Do not tell the wearer that a named firmware train is defective. Do not tell them that a named app train is defective. Collect versions so operations can split cohorts.

### Splits to capture (connectivity)

If firmware is 1.4.2, still collect a same-window control if the wearer can name a household device on 1.4.1. If app is 3.2, still collect whether firmware is 1.4.1 or 1.4.2. The playbook’s job is the split, not the verdict. 1.4.1 also contains a BLE change (idle-skip); do not describe every BLE ticket as “the new supervisor.”

Workarounds to offer, in order: toggle Bluetooth on the phone; force-stop and reopen Loop App; reseat the core on the ring; note whether disconnects persist with the phone in the same room.

If the ticket is only “the red battery icon looks alarming,” also tag `app-ui` and do not treat it as a radio fault.

Related: KD-02 (what changed in which train), KD-01 §4 (radio contract), KD-04 KI-RF-003 (office chatter) and KI-AP-019 (OEM kill).

---

## Queue: battery and charging

### Intake (battery)

Symptoms: dies by evening, overnight plunge, charge puck blamed, cold-weather complaint.

Take: region, indoor vs outdoor wear, whether the core was left in a cold bag, firmware, app, whether drain stepped versus the wearer’s prior weeks.

### Nordics versus other regions (battery)

Nordics tickets that describe outdoor morning wear and a higher daily drain, without a step-change versus the wearer’s own prior weeks, should be handled as **known regional behaviour** pending operations review. Quote KD-04 KI-NW-014 magnitudes if asked for a number; do not invent a temperature cut-off from the patch thermistor. The export has no ambient °C field.

Do not open a hardware replacement solely because the device is in Nordics. Do not dismiss a **step-change** on a single device that previously matched temperate means; that is a different shape.

Iberia tickets that describe “it was disconnected for hours” with a full battery are usually session-gap, not drain. Cross-tag `connectivity` / `app-sync` and see KI-IB-022.

Related: KD-04 KI-NW-014, KD-01 §5, KD-04 KI-UI-011 if the complaint is chrome colour rather than minutes of wear.

---

## Queue: adhesion, comfort, skin

### Intake (adhesion)

Symptoms: lifted edge, itch, red mark, will not stay on in training.

Take: activity level, duration of wear, whether the ring was replaced on schedule, photos if offered, lot if printed on the pouch.

### What not to close (adhesion)

Adhesion under high motion and elevated patch-site temperature delta is **not** a closed known issue. Do not tell the wearer this is expected. Log `adhesion` and `skin-irritation` as appropriate, offer a replacement ring, and escalate clusters to operations rather than closing as “characteristic.”

Comfort-without-lift (bulk, corners) is `comfort-fit` and is cosmetic unless the ring is lifting.

Do not speculate about dermatological causes. No clinical language. A prior lot recall (KD-06 INC-2025-031) was real; a new cluster still needs a lot split, not a wave-away via KI-AD-007.

Related: KD-01 §9 (open characterisation), KD-04 KI-AD-007 (open).

---

## Queue: readiness and score meaning

### Intake (claims-misread)

Symptoms: wearer treats the number as a clinical result; asks what disease it is; asks whether to cancel work; press or partner forwarded a screenshot.

This is the **claims-misread** queue. Tags: `claims-interpretation`, often `data-accuracy`.

### Staff script (claims-misread)

Internal voice, then paraphrased to the wearer without medical content:

- Readiness is a wellness indication computed by the app.  
- Kestrel does not describe it as a diagnosis, test, or treatment prompt (KD-05).  
- Staff must not confirm or deny a medical state.

If the thread is heading toward clinical advice, end the medical fork and offer a factual product sentence: the score is a 0–100 wellness indication. Point operations at KD-05 if the copy on-screen is what confused the wearer.

Do not debate the wearer’s health. Do not upgrade the ticket to “clinical incident.” Communications risk is real; clinical authority is not.

Related: KD-05 entire; KD-06 INC-2025-002 for a prior comms event.

---

## Queue: packaging, app-ui, other cosmetic

### Packaging

Packaging damage is `packaging`. It is not radio, not battery, not adhesion unless the ring itself is crushed.

### App chrome

App chrome, colour, and alarming red battery art are `app-ui`. Neither is a radio or battery defect by itself. Nordics battery tickets often arrive with `app-ui` because the sparkline is red at 40 % remaining; split the tags (KI-UI-011).

---

## Severity for support (not operations severity)

Support severity is SLA only: P1 cannot wear, P2 degraded, P3 cosmetic. It is not the operations severity index. Do not write HIGH/MEDIUM/LOW operations bands on the ticket.

P1 that is “cannot pair” still needs firmware and app captured separately. P1 that is “score scared me” is still claims-misread, not a hardware P1.

---

## When to page operations

### Page

Page if: many tickets with the same firmware train and the same new radio or battery shape within 72 hours; a claims thread that has left the support surface (press, regulator, clinician); a skin injury claim; a new adhesion cluster on one ship week (lot split).

### Do not page

Do not page solely because Nordics battery tickets exist; KI-NW-014 already describes that baseline. Do page if Nordics drain **steps** relative to last week on the same devices. Do not page solely because Iberia users report long gaps until operations has the regional `session_gap_minutes` split (KI-IB-022).

---

## Version capture

Always store firmware and app as separate fields. Never a single “software version.” The 4–17 May 2026 window in particular contains mixed 1.4.1/1.4.2 and mixed 3.1/3.2.

If the wearer only knows “it updated last week,” ask whether the Loop App store page or the patch itself was mentioned. App 3.2 and firmware 1.4.2 share a calendar week.
