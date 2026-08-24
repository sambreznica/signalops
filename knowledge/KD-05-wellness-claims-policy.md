# Wellness Claims and Communications Policy

**Document ID:** KD-05  
**Classification:** Internal — Legal / Communications / Support  
**Owner:** Regulatory Communications  
**Approved:** General Counsel  
**Version:** 3.1  
**Effective:** 2026-02-03  
**Last revised:** 2026-04-21  

This is a **policy register**. It states what Kestrel Health may and may not claim about Loop and about readiness. It is not wearer-facing copy. It contains no second-person medical address. Staff drafts that quote this policy must keep that voice: the company, the product, the score — not “you.”

---

## 1. Scope

Applies to: in-app strings, store listings, support macros, press, investor, and partner materials, and any operations narrative that may leave the building. Applies to firmware and app trains currently shipped (1.4.x / 3.x) and to predecessor copy still in market.

Does not authorise clinical interpretation of field telemetry. Does not decide whether a field pattern is an incident.

### 1.1 Surfaces in scope

Loop App chrome, App Store / Play listing, support macros, partner one-pagers, investor FAQ, press replies, and any investigation summary that might be forwarded. Firmware release notes (KD-02) are engineering artefacts; they still must not add clinical captions when quoted outward.

### 1.2 Surfaces out of scope

Wearer-to-wearer social posts are not Kestrel speech. Kestrel still must not amplify them with prohibited descriptions.

---

## 2. Product classification (policy)

Kestrel Loop is placed on the market as a **wellness** product. Kestrel Health shall not describe Loop as a medical device. Kestrel Health shall not describe readiness as a diagnosis, as a screening test, as a prognosis, or as a treatment recommendation.

Where a jurisdiction requires a wellness disclaimer, Legal supplies the sentence. Support shall not invent a local clinical disclaimer.

### 2.1 Hardware versus score

Battery, radio, and adhesion telemetry are not health claims. Classifying the product as wellness does not make a firmware radio note into a clinical statement, and it does not make a Nordics drain offset into a metabolic claim.

---

## 3. Readiness — permitted descriptions

Kestrel materials **may** describe readiness as:

- a 0–100 **wellness indication** derived from overnight motion quiescence, session continuity, and a personal baseline;
- a **day-to-day comparison** for the same wearer;
- **non-clinical**, **not a medical result**, **not a substitute for professional care** (company-voice; not an instruction to a named person).

Kestrel materials **may** state that some wearers **misread** the score as a clinical result. That is a communications-risk statement. It is not a diagnosis of those wearers.

### 3.1 Allowed engineering gloss

Materials may say the score uses overnight motion quiescence and session continuity. Materials may say a radio gap can lower the score without any change in overnight motion. That is an engineering gloss. It is not a health interpretation.

---

## 4. Readiness — prohibited descriptions

Kestrel materials **shall not**:

- describe readiness as a **diagnosis**;
- describe readiness as detecting, ruling out, or monitoring a disease or condition;
- pair the score with directive medical verbs aimed at a person (examples of banned shapes, listed so reviewers can grep drafts: “you may have”, “consult your doctor”, “indicates a condition”, “we recommend seeing”, “symptoms suggest”);
- use “test result”, “lab”, “pathology”, “positive/negative” in the clinical sense next to the score;
- imply that a low score **requires** rest as medical treatment.

Support macros that paraphrase a wearer who already used clinical language shall not **repeat** that language as Kestrel’s view. Restate: the score is a wellness indication.

### 4.1 Why the banned list exists

The list is a grep aid for reviewers. Close variants (second-person clinical instruction, doctor-referral as Kestrel speech) are also prohibited even if the five strings are avoided by synonym. Policy 3.1 added the list after a 2026-04 tabletop; it does not authorise using the phrases in wearer-facing macros “as examples.”

---

## 5. Other signals — battery, radio, adhesion

Battery drain, BLE disconnects, session gaps, and adhesion flags are **engineering telemetry**. They may be discussed in operations prose. They shall not be framed as signs of a wearer’s health state. A hot patch-site delta is not a fever claim. A high drain is not a metabolic claim.

### 5.1 Regional drain

A Nordics elevation in `battery_drain_pct` (KD-04) is a regional engineering characteristic. Communications shall not describe it as the device detecting illness or climate-related disease risk.

### 5.2 Session gaps

Long `session_gap_minutes` (including the Iberia open item in KD-04) shall not be described as the wearer being unwell or non-compliant in a clinical sense.

---

## 6. Store, press, and partner

App-store text is pre-cleared. “Tracks wellness trends” is allowed. “Tells you if you are sick” is not. Partner decks shall not show readiness beside clinical KPIs.

### 6.1 Press reply

Press replies to “is this a medical device?” : “Kestrel Loop is a wellness product. Readiness is a wellness indication, not a diagnosis.” Stop. Do not add referral language.

### 6.2 Partner screenshots

Partner newsletters that put the tile next to clinical vocabulary created INC-2025-002. Partners receive this policy, not a custom clinical caption.

---

## 7. Support intersection

KD-03 claims-misread queue implements this policy. Staff who need a citation for a claims-risk flag on an investigation cite **this document**, not a live ticket, as the rule source.

If on-screen copy is what caused the misread, Communications files a copy bug. That is still not a medical event.

### 7.1 What support must not do

Support shall not confirm a medical state, shall not deny a medical state, and shall not invent a clinical disclaimer. The product sentence is: readiness is a 0–100 wellness indication.

---

## 8. Historical reminder

A 2025 comms event (KD-06 INC-2025-002) involved social screenshots of readiness treated as a clinical result. Policy 3.0 followed. This revision (3.1) adds the explicit banned-phrase list after a 2026-04 tabletop.

Firmware trains and battery KIs did not cause that event. Copy did.

---

## 9. Review cadence

Legal reviews this register at least twice yearly and on any store-copy change. Firmware notes (KD-02) do not alter this policy. A radio or battery train never authorises stronger health language.

### 9.1 App 3.2 copy review

App 3.2 shipped with a KD-05 review dated 2026-05-02 (recorded in KD-02). The denser sparkline did not add clinical vocabulary. Future chrome still needs a pass.

---

## 10. Investigation narrative

Operations summaries that leave the building inherit this policy. An investigation may discuss wearer **misinterpretation** of readiness. It may cite this register. It shall not speak as a clinician. Uncertainty notes may flag communications risk. They shall not enact the banned phrases.
