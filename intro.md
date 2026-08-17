# Interview Prep — Adaptive Risk-Aware Chaos Engineering Framework

> Study this before the interview. It mirrors the actual code in this repo.

---

## 1. Elevator Pitch (30 seconds)

> "I built a chaos engineering framework that doesn't inject failure blindly. Instead of killing pods on a timer like Netflix Chaos Monkey, it first measures live risk from Prometheus metrics — latency, error rate, CPU, memory — computes a weighted Resilience Risk Score, classifies the system as SAFE / MODERATE / CRITICAL, and only deletes a pod inside a safe window. Kubernetes then self-heals. The real contribution is the explainable decision layer in front of chaos, not chaos itself."

---

## 2. The Complete Logic Flow (know this cold)

The whole system is one closed control loop running every 30 seconds:

1. **Services expose metrics.** Service A (`/api` with simulated 50–750ms latency, 20% random failures) and Service B (background worker sim) export Prometheus metrics on `/metrics` via `prom-client`.
2. **Prometheus scrapes** both services every 5 seconds (`k8s/prometheus.yaml`, scrape interval 5s).
3. **Risk Engine queries Prometheus** every 30 seconds via PromQL (`risk-engine/index.js`):
   - latency: `avg_over_time(service_a_last_request_latency_ms[1m])`
   - error rate: `(sum(rate(errors[1m])) / clamp_min(sum(rate(requests[1m])), 0.0001)) * 100`
   - CPU: `avg(app_cpu_usage_percent{service="service-a"})`
   - memory: `avg(app_memory_usage_percent{service="service-a"})`
4. **Normalize** each raw value to a 0–100 scale (so mixed units become comparable).
5. **Compute RRS** = `0.35·latency + 0.35·errorRate + 0.20·CPU + 0.10·memory` (weights configurable via env `W1`–`W4`).
6. **Classify:** SAFE (< 40), MODERATE (40–70), CRITICAL (≥ 70).
7. **Decide:** SAFE → ALLOW_CHAOS, MODERATE → REDUCE_INTENSITY, CRITICAL → BLOCK_CHAOS.
8. **Act:** only on ALLOW_CHAOS **and** past the cooldown (90s) does it run `kubectl delete pod` on a pod labeled `app=service-a`.
9. **Self-heal:** the Deployment controller sees a replica dropped below desired count and recreates the pod.

Two inspection endpoints: `/health` and `/decision` (returns the last full evaluation as JSON).

---

## 3. Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Language | Node.js 20 | Async-friendly, same stack across all services |
| API framework | Express | Minimal HTTP server for `/api`, `/health`, `/metrics` |
| Metrics | prom-client | Emits Prometheus-format metrics (`/metrics`) |
| HTTP client | Axios | Risk Engine → Prometheus API queries |
| Cluster | Kubernetes (Minikube) | Runs workloads, provides self-healing |
| Monitoring | Prometheus | Scrapes and stores metrics, PromQL querying |
| Visualization | Grafana | Provisioned Prometheus datasource |
| Container | Docker + Alpine images | Reproducibility; risk-engine image bundles `kubectl` |
| Orchestration | PowerShell script | One-click `RUN-EMERGENCY.cmd` demo launcher |
| Access control | K8s RBAC (Role, not ClusterRole) | Least-privilege: only get/list/watch/delete pods |

---

## 4. Project Stage

Prototype/demo stage (per `README.md` badges and `doc/score.md`): **idea 7.5/10, current build 5.5/10, target 9/10**. Say this honestly:

> "It's a working local prototype, not production software. The architecture and full pipeline are done; the roadmap to a defensible 9/10 is fixing a tuning issue in the scoring, adding automated tests, and adding a second fault type."

If asked what is *not* done: no persistence, no auth, static weights, single fault primitive.

---

## 5. Interview Q&A — Scripted Answers

**Q: What is a Resilience Risk Score? Why a weighted sum and not ML?**

> "It's a single 0–100 number that compresses four health signals into one comparable value. I use a weighted sum because it's transparent and explainable — an operator can see exactly why the score is high (e.g., error rate contributed 35 points). Weights are env-configurable (`W1`–`W4`), so you can retune without code changes. I deliberately chose rule-based over ML because the decision layer must be auditable; ML would be a black box."

**Q: Why did you normalize the metrics?**

> "Latency is in milliseconds, error rate is a percentage, CPU/memory are already 0–100. You can't add those directly. Normalization maps each to a common 0–100 scale so the weighted sum is meaningful. I also cap at 100 to avoid one metric dominating unbounded."

**Q: How do you prevent chaos from running too often?**

> "Two gates. First, the decision gate — `tryInjectChaos` only proceeds if the decision is `ALLOW_CHAOS`. Second, a cooldown — `CHAOS_COOLDOWN_MS` (default 90s). Even in SAFE state it tracks `lastChaosAt` and skips if the last deletion was too recent, so the system gets time to stabilize and self-heal between experiments."

**Q: How does the risk engine talk to Kubernetes?**

> "It shells out to `kubectl` via `execSync`. It first finds a pod with `kubectl get pods -l app=service-a`, then deletes it with `--wait=false` (fire-and-forget). I wrapped this in RBAC — the risk-engine Deployment uses a dedicated ServiceAccount bound to a namespaced Role granting only `get/list/watch/delete` on pods. That's least privilege: it can kill pods but nothing else in the cluster."

**Q: What happens after a pod is deleted?**

> "The Deployment controller is the self-healing mechanism. The Deployment declares `replicas: 2` for service-a, so the moment a pod disappears the controller notices the mismatch and schedules a replacement. I don't write any custom recovery logic — that's the point, Kubernetes gives resilience for free."

**Q: How is this different from Netflix Chaos Monkey?**

> "Chaos Monkey injects randomly on a schedule by design — it assumes the system is always resilient and proves it by constant killing. My controller does the opposite: it *reasons before acting*. It measures whether the system can tolerate a fault right now, and only then injects. Monkey deliberately omits a risk gate; my contribution is precisely that gate plus full explainability. I target pre-production and educational validation where blind injection is inappropriate, not production chaos."

**Q: Why is it called 'adaptive'?**

> "The *decision* adapts to live metrics every cycle — the system re-evaluates and changes its behavior (allow/reduce/block) based on current conditions. The scoring *model* is currently static; making thresholds adapt from a rolling baseline is explicitly on my roadmap."

**Q: What PromQL queries do you use, and why?**

> "For latency I use `avg_over_time` over a 1-minute window to smooth noise. For error rate I use `rate()` (requests/sec) and divide errors by requests, with `clamp_min` on the denominator to avoid divide-by-zero. CPU and memory are averages scoped to the target service via the `service="service-a"` label."

**Q: What would you improve?**

> "Four things: (1) fix the scoring calibration so the SAFE window is actually reachable at default settings, (2) add automated tests for the scoring/decision functions, (3) replace the `kubectl` shell-out with the official `@kubernetes/client-node` for reliability and auditability, (4) add a second fault primitive like network latency via `tc netem` so it's honestly a framework, plus decision persistence for post-run analysis."

---

## 6. Key Code — Explain Line-by-Line

These functions are the heart. Be ready to walk through each one.

**1. `normalizeMetrics`** — `risk-engine/index.js`
```js
function normalizeMetrics(raw) {
    return {
        latency: Math.min(raw.latencyMs / 10, 100),        // 0-1000ms -> 0-100
        errorRate: Math.min(raw.errorRatePercent * 5, 100), // % scaled up
        cpu: Math.min(raw.cpuPercent, 100),
        memory: Math.min(raw.memoryPercent, 100),
    };
}
```

**2. `calculateRRS`** — `risk-engine/index.js`
```js
function calculateRRS(normalized) {
    return (
        WEIGHTS.latency * normalized.latency +
        WEIGHTS.errorRate * normalized.errorRate +
        WEIGHTS.cpu * normalized.cpu +
        WEIGHTS.memory * normalized.memory
    );
}
```

**3. `classifySystem` + `decisionFromState`** — `risk-engine/index.js`
```js
function classifySystem(rrs) {
    if (rrs < 40) return 'SAFE';
    if (rrs < 70) return 'MODERATE';
    return 'CRITICAL';
}
function decisionFromState(state) {
    if (state === 'SAFE') return 'ALLOW_CHAOS';
    if (state === 'MODERATE') return 'REDUCE_INTENSITY';
    return 'BLOCK_CHAOS';
}
```

**4. `tryInjectChaos`** — the safety-gated chaos action
```js
function tryInjectChaos(decision) {
    if (decision !== 'ALLOW_CHAOS') return 'SKIPPED';                     // gate 1: decision
    const now = Date.now();
    if (now - lastChaosAt < CHAOS_COOLDOWN_MS) return 'SKIPPED_COOLDOWN'; // gate 2: cooldown
    // ... kubectl delete pod
}
```

**5. CPU percent** — `service-a/index.js` (non-trivial systems detail)
```js
const currentCpuUsage = process.cpuUsage(lastCpuUsage);          // delta since last call
const usedMicros = currentCpuUsage.user + currentCpuUsage.system;
const cpuPercent = (usedMicros / (elapsedMs * 1000 * os.cpus().length)) * 100;
```

That computes CPU as a percentage of wall-clock time × cores — a real systems concept.

**6. Error-rate PromQL** — the clamp-min detail
```promql
(sum(rate(service_a_request_errors_total[1m])) / clamp_min(sum(rate(service_a_requests_total[1m])), 0.0001)) * 100
```
`clamp_min` guards the denominator so the division never divides by zero when no requests flow.

---

## 7. The Known Tuning Bug (turn it into a strength)

At default settings, **the SAFE state is mathematically unreachable, so auto-chaos never fires.** The math:

- Error normalization is `errorRatePercent * 5`. Service A fails 20% of requests by design, so `20 * 5 = 100` (saturated).
- So error rate alone contributes `0.35 × 100 = 35` points to RRS.
- Latency averages ~400ms → normalized ~40 → contributes `0.35 × 40 = 14`.
- RRS ≈ 49.8 → classified **MODERATE**, forever. SAFE needs `< 40`.

If the interviewer asks "so does it actually delete pods?" — turn it into a strength:

> "Great question. I actually found a calibration bug during review: the error-rate normalization saturated at the default 20% failure rate, which pinned RRS around 50 — permanently in MODERATE — so the safe window was unreachable and auto-chaos rarely fired. The fix is straightforward: make the failure rate configurable (lower default), rescale error normalization, or make the SAFE threshold configurable — and add a deterministic demo-safe mode. This is exactly why I'm adding unit tests for the scoring functions."

Interviewers value you finding and understanding your own bug, explaining the root cause with numbers, and knowing the fix.

---

## Quick Memory Triggers

- **Ports:** Service A :3000 · Service B :3001 · Risk Engine :3002 · Prometheus :9090 · Grafana :3000 (forwarded to 3003)
- **Replicas:** service-a = 2, service-b = 1, risk-engine = 1
- **Weights:** W1=0.35 latency, W2=0.35 error, W3=0.20 CPU, W4=0.10 memory
- **Thresholds:** SAFE < 40, MODERATE < 70, else CRITICAL
- **Timing:** scrape 5s, decision loop 30s, chaos cooldown 90s
- **Chaos action:** delete one pod labeled `app=service-a` via kubectl, `--wait=false`
