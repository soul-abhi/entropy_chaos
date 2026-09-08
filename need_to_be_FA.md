# Need to be fixed / added — Gap between current code and `final.md`

**Last updated:** 2026-09-07
**Compare:** current implementation (`README.md` prototype) vs `final.md` (**Entropy Chaos** — locked research spec)
**Phase 0 status:** DONE 2026-09-07 — scoring retune in code (`FAILURE_RATE`, error-norm `*2`,
`DEMO_SAFE_MODE`, fail-closed), decision semantics made honest (MODERATE → BLOCK), dead CPU math
removed, unit tests added (`node --test`), docs re-synced. Work is uncommitted in git.

---

## Bottom line

`final.md` defines a **resilience-boundary discovery engine**: multidimensional experiment envelope,
a separate Safety Controller, trajectory observation, and a continuously updated resilience model.

The current repo is the earlier **single-gate pod-delete prototype**: RRS → SAFE/MODERATE/CRITICAL →
delete 1 pod. It implements roughly Section 7 (RRS) of the spec and none of the adaptive-search,
interaction, trajectory, or resilience-profile parts.

The uncommitted working-tree changes (demo mode, fail-closed, `FAILURE_RATE`) are real progress, but
they only patch the safety gate — they do not close the architecture gap.

Legend: **[FIX]** = current code contradicts the spec / is broken. **[ADD]** = required piece missing.

---

## Phase 0 — Make the prototype honest (smallest, unblocks everything)

1. **[FIX]** Commit / finalize the working-tree scoring fix: `FAILURE_RATE`, error-norm `*2`,
   `DEMO_SAFE_MODE`, fail-closed on observability loss. This is the only change that makes the
   SAFE → ALLOW_CHAOS → DELETED_POD → self-heal loop actually reachable.
2. **[FIX]** Re-sync docs with the code — they currently contradict it:
   - `intro.md` §2/§7 still says 20% failures, error-norm `*5`, RRS pinned ≈ 50.
   - `project_timeline.md` still marks FLAGGED-01 as "FIX IN PROGRESS".
   - README formula comment is stale.
   - `final.md` permits scoring changes; the interview/docs must describe the running system.
3. **[FIX]** `decisionFromState` returns `REDUCE_INTENSITY` but nothing is ever reduced or aborted —
   that string is a lie. Spec §7 requires real `ALLOW / REDUCE / ABORT` semantics with an independent
   controller that can veto selection. Either implement reduce/abort or collapse to `ALLOW/BLOCK`.
4. **[FIX]** FLAGGED-03: remove CPU dead code (`* os.cpus().length` cancels) while touching services.
5. **[FIX]** Add unit tests for `normalizeMetrics` / `calculateRRS` / `classifySystem` (FLAGGED-02)
   so the retune is provable.

---

## Phase 1 — Structure the controller as the spec mandates (§7, §8)

6. **[FIX]** Split the single `risk-engine/index.js` loop into two layers (architecturally mandatory
   per `final.md`):
   - **Entropy Search / selection** — picks the next informative experiment (absent today).
   - **Safety Controller (RRS, evolved)** — answers "is *this experiment* safe to try now?" and can
     veto selection independently.
7. **[ADD]** Introduce the **experiment object** `E = (F, S, M, D, T, C, L)` (§5): fault type, scope,
   magnitude, duration, timing, combination, load. Today the loop has no experiment notion — only
   "delete a pod."
8. **[ADD]** Define the **L1–L10 fault classes as data** (§4). Current code covers only L1 (delete /
   restart pod) plus *simulated* L3/L6 inside service-a that cannot be injected on demand. Add
   per-level injector primitives:
   - L1 component disruption (pod restart / delete)
   - L2 resource exhaustion (CPU/mem stress)
   - L3 latency / degradation
   - L4 network impairment (packet loss / partition / DNS)
   - L5 dependency failure (service/DB/cache outage)
   - L6 application failure (5xx toggle / timeout / malformed response)
   - L7 capacity / load pressure
   - L8–L10 are compositions built from the lower primitives.

---

## Phase 2 — Real injection backends (§4, §8 Step 5)

9. **[ADD]** Replace the single `kubectl delete pod` path (and the duplicate
   `chaos-module/chaos-injector.js`) with a small injector registry whose backends can all be
   **started and stopped**: pod delete/restart, CPU/mem stress, `tc netem` latency/loss, app-level
   failure-rate control, synthetic traffic/load. Prefer Chaos Mesh or K8s-native mechanisms over
   new infrastructure; the key requirement is start/stop control.
10. **[FIX]** FLAGGED-05 / FLAGGED-07:
    - Make Service B a **real dependency** of Service A (Service A calls B) so latency/error
      propagate — the dependency edge is the raw material for interaction and cascade discovery.
    - Replace `kubectl` shell-out with `@kubernetes/client-node` for auditable start/stop.

---

## Phase 3 — Observe the trajectory, not before/after (§8 Steps 1, 2, 6; §11)

11. **[ADD]** **Baseline capture**: sample healthy metrics (p99, error rate, availability,
    throughput) before an experiment starts (§8 Step 2).
12. **[ADD]** **Trajectory sampling during an experiment**: query Prometheus on a short cadence while
    the experiment runs and store `x(t)` per experiment. Biggest conceptual miss vs `final.md` — the
    spec distinguishes healthy→degrade→stabilize from healthy→degrade→collapse, which the current
    30 s periodic check cannot see.
13. **[ADD]** **Boundary detection / mid-experiment abort** (§11): terminate or reduce the *running*
    experiment when p99 / error trends approach a configured unsafe line, instead of only gating the
    next cycle.

---

## Phase 4 — Adaptive escalation and experiment selection (§6, §8 Steps 3 & 9)

14. **[ADD]** **Escalation controller**: progress magnitude (CPU 20→40→…, latency 50→100→…), blast
    radius (1 pod → % → 100%), duration (5s → 10s → 30s → …), temporal order, and composition
    (single → pair → triple → sequential → cascade). Selection must be **guided by prior outcomes**,
    not a fixed table.
15. **[ADD]** **Experiment history store** (FLAGGED-09 / A8): record each experiment, decision,
    trajectory, and outcome so the next selection and the resilience profile have evidence. Today
    only in-memory `lastDecision` exists.

---

## Phase 5 — Analysis, profile, and evaluation (§9, §10, §12, §13, §17)

16. **[ADD]** **Interaction / temporal analysis**: classify outcomes as independent / additive /
    nonlinear / temporal / cascading; compare `A→B` vs `B→A` vs `A→wait(t)→B`.
17. **[ADD]** **Failure-phenotype classifier**: Elastic / Brittle / Delayed-collapse / Cascading /
    antifragile, derived from the empirical trajectory (§12).
18. **[ADD]** **Resilience Profile output** (§13): per-level PASS / WARNING / BOUNDARY /
    NOT-ENTERED; verified envelope limits (max pods lost, max latency, …); dominant phenotype;
    primary interaction; propagation path; safety-policy verdict; confidence. Expose it next to
    `/decision` (e.g. `/profile`).
19. **[ADD]** **Evaluation harness** for the §17 metrics (experiments-to-boundary,
    redundant-experiment rate, false-abort rate, safety violations, boundary stability) so the
    paper's central hypothesis can be measured.

---

## Phase 6 — Framing and docs (cheap, paper-facing)

20. **[FIX]** Rebrand to **Entropy Chaos / entropy_chaos** in README/intro if `final.md` is now the
    project identity.
21. **[ADD]** Document the L1–L10 → Safety → Injector separation as the architecture in README; the
    current mermaid shows only the old single loop.
22. **[FIX]** Grafana `admin/admin` + unauthenticated Risk Engine API: keep as demo-only, load creds
    from a Secret before any shared deployment (FLAGGED-06). `final.md` §17 evaluation expects an
    honest environment.

---

## Recommended order

Phase 0 → 1 → 2 first: they turn the honest prototype into the correct architecture
(Safety Controller + selection + real injectors). Phase 3 (trajectory / abort) is the core research
contribution and should follow immediately. Phases 4–5 are where the paper evidence comes from.
Phase 6 is cosmetics + security.

---

## Source of truth documents

- `final.md` — Entropy Chaos locked research spec (this file is the target).
- `project_timeline.md` — bug tracker (FLAGGED-01 … FLAGGED-10) + roadmap to 9/10.
- `README.md` / `intro.md` — current prototype description (needs re-sync, see Phase 0).
