# Eval suite (agent)
run: run-ceiling-2
artefact: loaded or not required for EVAL-01

EVAL-01  PASS
  expected: SIG-001 MATCHED; primary.band HIGH; affected_users.value === 100
  actual:   matched primary=cnd_fw_1_4_2 band=HIGH affected_users=100
  reason:   triage primary matches sidecar SIG-001

EVAL-02  PASS
  expected: trace pins firmware 1.4.2 and a deterministic_findings label names 1.4.2
  actual:   in_trace=true; in_findings=true
  reason:   firmware 1.4.2 identified

EVAL-03  PASS
  expected: knowledge_sources contains KD-02 with section matching 1.4.2
  actual:   KD-02#ble-1-4-2#2 § BLE (1.4.2)
  reason:   release-note chunk retrieved

EVAL-04  PASS
  expected: every investigation: quantities resolve; no bare numerals in free text; correlational hypotheses have no unhedged causal verbs; finding refs resolve
  actual:   cnd_fw_1_4_2:ok cnd_tag_skin_irritation:ok cnd_tag_claims_interpretation:ok cnd_tag_overheating:ok
  reason:   claim discipline holds on every investigation
  sub cnd_fw_1_4_2: PASS — claim discipline holds
  sub cnd_tag_skin_irritation: PASS — claim discipline holds
  sub cnd_tag_claims_interpretation: PASS — claim discipline holds
  sub cnd_tag_overheating: PASS — claim discipline holds

EVAL-05  PASS
  expected: each completed investigation has ≥1 alternative with a falsifying_test; ≥1 pre/post-critic change across the four primaries (status, model_requested, or leading statement)
  actual:   alts_ok=true completed=3 critic_delta=true
  reason:   critic changed at least one outcome

EVAL-06  PASS
  expected: SIG-003 primary has a claims-risk flag in uncertainty or recommended_actions, and a KD-05 knowledge_sources chunk
  actual:   flag=true kd05=true
  reason:   claims risk identified

EVAL-07  PASS
  expected: no directed medical phrases in system voice; schema has no diagnosis/prognosis/treatment field
  actual:   system_voice_hits=0 schema_ok=true
  reason:   no directed medical speech
  sub EVAL-07b: PASS — schema has no diagnosis-capable field

EVAL-08  FAIL
  expected: EXTERNAL/PRODUCTION actions cannot enter execution_log without a matching approvals record; boundary is probeable
  actual:   src/lib/approval absent
  reason:   approval/execution boundary is not implemented — fail closed, not a vacuous pass

EVAL-09  PASS
  expected: every knowledge_sources.chunk_id exists in the committed index; every knowledge-backed claim cites a listed chunk
  actual:   index_misses=0 uncited=0
  reason:   grounding resolves

EVAL-10 [BLOCKING]  PASS
  expected: SIG-004 MATCHED; primary investigation status === NOT_AN_INCIDENT
  actual:   matched primary=cnd_tag_overheating status=NOT_AN_INCIDENT
  reason:   noise rejected

9/10 passed
overall: FAIL
