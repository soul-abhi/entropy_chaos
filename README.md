# Adaptive Risk-Aware Chaos Engineering Framework

## 1. Project Summary

This project is a local, free, prototype implementation of an adaptive chaos engineering framework for microservices. The core idea is simple:

do not inject chaos blindly;
first compute system risk in real time, then decide whether chaos is safe.

The prototype runs on local Kubernetes and demonstrates risk-aware, rule-based decision making before a pod-kill experiment is executed.

## 2. Why This Project Matters

Traditional chaos experiments often run on fixed schedules or manual triggers. That can create two problems:

- injecting failure during already unstable conditions
- missing chances to test resilience when the system is healthy

This framework introduces a risk gate. Chaos runs only when the system is in a safe window according to live metrics.

## 3. What Is New Compared to Typical Chaos Demos

- Decision-first chaos: experimentation is controlled by a risk score, not by a timer alone.
- Adaptive behavior: same chaos action can be allowed, softened, or blocked based on current state.
- Monitoring + control loop: Prometheus metrics directly feed the chaos decision engine.
- Clear explainability: every cycle prints metrics, score, state, and final action in logs.

## 4. Prototype Scope (Current Version)

Included in this prototype:

- two microservices
- Prometheus metrics collection
- rule-based resilience risk score calculation
- three-state decision logic (SAFE, MODERATE, CRITICAL)
- chaos action: Kubernetes pod deletion
- automatic rollback via Kubernetes self-healing

Not included in this prototype:

- machine learning
- managed cloud services
- complex multi-fault orchestration
- production hardening (auth, multi-tenant security, persistent data layer)

## 5. Architecture Followed

### 5.1 High-Level Flow

1. Service A and Service B expose metrics.
2. Prometheus scrapes and stores live metrics.
3. Risk Engine queries Prometheus every 30 seconds.
4. Risk Engine computes RRS and classifies system state.
5. Risk Engine decides whether to run chaos.
6. If allowed, a Service A pod is deleted.
7. Kubernetes recreates the pod automatically.

### 5.2 Component Diagram

```text
                    +-----------------------------+
                    |       Prometheus UI         |
                    |       localhost:9090        |
                    +-------------+---------------+
                                  ^
                                  |
                      scrape /metrics endpoints
                                  |
+------------------+       +------+-------+
|   Service A      |       |   Service B  |
| /api /health     |       | worker sim   |
| /metrics         |       | /metrics     |
+--------+---------+       +------+-------+
         ^                        ^
         |                        |
         +-----------+------------+
                     |
                     v
            +--------+---------+
            |   Risk Engine    |
            | query + scoring  |
            | decision every   |
            | 30 seconds       |
            +--------+---------+
                     |
                     | ALLOW_CHAOS only
                     v
            kubectl delete pod <service-a-pod>
                     |
                     v
               Kubernetes self-healing
```

### 5.3 Risk Formula Used

RRS = (W1 × Latency) + (W2 × ErrorRate) + (W3 × CPU) + (W4 × Memory)

Current default weights:

- W1 latency = 0.35
- W2 error rate = 0.35
- W3 CPU = 0.20
- W4 memory = 0.10

Thresholds:

- RRS < 40 -> SAFE -> ALLOW_CHAOS
- 40 <= RRS < 70 -> MODERATE -> REDUCE_INTENSITY
- RRS >= 70 -> CRITICAL -> BLOCK_CHAOS

## 6. Tech Stack Used

- Node.js (Express)
- prom-client
- Docker
- Kubernetes (Minikube or Docker Desktop K8s)
- Prometheus
- kubectl

All tools are free and run locally.

## 7. Folder Structure

```text
adaptive-chaos/
├── service-a/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── service-b/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── risk-engine/
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── chaos-module/
│   ├── chaos-injector.js
│   └── README.md
├── k8s/
│   ├── prometheus.yaml
│   ├── services.yaml
│   └── deployments.yaml
└── README.md
```

## 8. Setup Guide (Windows, Step by Step)

## 8.1 Install Prerequisites

Install these first:

- Docker Desktop
- Node.js LTS (20+)
- kubectl
- Minikube

Optional one-line installs using winget:

```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Kubernetes.kubectl
winget install -e --id Kubernetes.minikube
```

## 8.2 Open the Project

```powershell
cd E:\major-project\adaptive-chaos
```

## 8.3 Start Local Kubernetes

```powershell
minikube start --driver=docker
minikube -p minikube docker-env --shell powershell | Invoke-Expression
kubectl get nodes
```

## 8.4 Build Project Images

```powershell
docker build -t adaptive-chaos-service-a:local .\service-a
docker build -t adaptive-chaos-service-b:local .\service-b
docker build -t adaptive-chaos-risk-engine:local .\risk-engine
```

## 8.5 Deploy the System

```powershell
kubectl apply -f .\k8s\prometheus.yaml
kubectl apply -f .\k8s\services.yaml
kubectl apply -f .\k8s\deployments.yaml
kubectl get pods -w
```

## 8.6 Emergency One-Click Run (Fast Demo)

If you need to start everything quickly during a panel/demo:

1. Double-click `RUN-EMERGENCY.cmd`
2. It will automatically:
   - ensure Minikube and Docker session setup
   - build images
   - apply Kubernetes manifests
   - wait for rollouts
   - open separate terminals for: - Prometheus port-forward (`9090`) - Service A port-forward (`3000`) - Risk Engine port-forward (`3002`) - Risk Engine live logs - Minikube dashboard

Manual equivalent:

```powershell
cd E:\major-project\adaptive-chaos
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
```

Optional flags:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1 -SkipBuild
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1 -NoDashboard
```

## 9. Demo Execution Flow (Panel-Ready)

Use these exact steps during presentation.

## 9.1 Show Running Pods

```powershell
kubectl get pods
```

## 9.2 Open Prometheus (GUI)

```powershell
kubectl port-forward svc/prometheus 9090:9090
```

Open browser at:

- http://localhost:9090

## 9.3 Generate API Traffic

Terminal A:

```powershell
kubectl port-forward svc/service-a 3000:3000
```

Terminal B:

```powershell
for ($i=0; $i -lt 100; $i++) { try { Invoke-WebRequest http://localhost:3000/api -UseBasicParsing | Out-Null } catch {}; Start-Sleep -Milliseconds 200 }
```

## 9.4 Observe Adaptive Decisions

```powershell
kubectl logs deployment/risk-engine -f
```

You should see:

- Current Metrics
- Current RRS
- Current System State
- Chaos Decision
- Chaos Action

## 9.5 Optional JSON Decision View

```powershell
kubectl port-forward svc/risk-engine 3002:3002
```

Open:

- http://localhost:3002/decision

## 10. What We Built Internally (Engineering View)

Service A:

- API endpoint with simulated latency and random failure rate
- health endpoint
- Prometheus metrics endpoint
- custom counters, latency histogram, CPU and memory gauges

Service B:

- background worker simulation with synthetic load
- Prometheus metrics endpoint
- CPU and memory reporting

Risk Engine:

- queries Prometheus API every 30 seconds
- normalizes live metric values
- computes RRS
- maps score to state and decision
- conditionally executes chaos via kubectl delete pod
- applies cooldown to avoid excessive pod kills

Kubernetes + RBAC:

- deployments and services for all components
- Prometheus deployment + scrape config
- role-based access for risk engine pod operations

## 11. Use Cases

This framework is useful for:

- academic projects and research demonstrations in resilience engineering
- pre-production testing of microservice stability under controlled faults
- DevOps teams introducing safer chaos practices with guardrails
- teaching risk-aware automation in distributed systems

## 12. Security and Dependency Status

Current state of the prototype dependencies:

- npm install completed for all Node services
- npm audit completed
- no high or critical vulnerabilities currently reported

Recommended recurring check:

```powershell
cd E:\major-project\adaptive-chaos\service-a; npm audit --audit-level=high
cd E:\major-project\adaptive-chaos\service-b; npm audit --audit-level=high
cd E:\major-project\adaptive-chaos\risk-engine; npm audit --audit-level=high
```

## 13. Troubleshooting

### 13.1 minikube command not recognized

- reopen PowerShell after installation
- verify PATH contains Minikube install directory
- run: minikube version

### 13.2 docker command not recognized

- ensure Docker Desktop is installed and running
- verify Docker CLI path exists in PATH
- run: docker --version

### 13.3 pods not starting

- check events: kubectl describe pod <pod-name>
- check logs: kubectl logs deployment/<deployment-name>

### 13.4 Prometheus has no data

- verify port-forward is active
- verify service pods are running
- check scrape targets in Prometheus UI

### 13.5 risk-engine cannot delete pod

- verify RBAC objects are applied from deployments.yaml
- verify risk-engine service account is attached in deployment

## 14. Frequently Asked Questions (Faculty + Technical)

Q1. Is this project only chaos testing?

No. The main contribution is adaptive risk-based decision control before chaos execution.

Q2. Why not inject chaos continuously?

Continuous blind chaos can destabilize systems unnecessarily. This framework adds safety-aware gating.

Q3. Why rule-based first instead of ML?

For prototype reliability, transparency, and local reproducibility. Rule logic is easy to explain and validate.

Q4. How is rollback handled?

Rollback is native Kubernetes self-healing. Deleted pods are recreated by deployment controllers.

Q5. Can this run without cloud services?

Yes. Entire stack runs locally on Minikube and Docker Desktop.

Q6. What metric is most important in scoring?

In this prototype, latency and error rate have highest weight. Weights are configurable.

Q7. Does this support real production clusters now?

Not yet. This version is intentionally scoped for local prototype demonstration.

Q8. What is the novelty from a research point of view?

The closed-loop architecture linking observability metrics to adaptive fault-injection authorization is the primary novelty.

Q9. How often is risk evaluated?

Every 30 seconds by default.

Q10. Can decisions be audited later?

Yes. Decision logs provide a complete step-by-step record of metric values and actions.

## 15. Future Scope and Long-Term Vision

The current prototype proves that risk-aware chaos control is feasible. The long-term direction is to evolve this into an intelligent resilience validation platform.

Planned evolution themes:

- move from static scoring toward predictive risk modeling using historical observations
- tune metric influence dynamically instead of fixed weighting
- expand beyond pod kill into broader failure domains such as network and resource faults
- scale from two services to larger, multi-service and potentially multi-cluster environments
- integrate with CI/CD for resilience gates, automated quality checks, and controlled release confidence
- add richer dashboards and reporting for resilience scoring, trend analysis, and governance visibility
- develop stronger experimental methodology for benchmarking recovery behavior and comparative resilience performance

In short: prototype validates feasibility; next phases target intelligence, scale, automation, and research depth.

## 16. Upcoming Phase Plan (Practical Roadmap)

Phase 1 complete:

- local adaptive prototype with rule-based decisions

Phase 2 next:

- richer chaos experiments and stronger observability dashboards

Phase 3 after that:

- CI/CD integration, automated validation gates, and reporting workflow

Phase 4 long term:

- predictive risk intelligence and large-scale resilience benchmarking

## 17. Two-Minute Panel Pitch (Suggested)

This system is an Adaptive Risk-Aware Chaos Engineering Framework.
Instead of injecting failures blindly, we first calculate live risk from latency, errors, CPU, and memory.
Every 30 seconds, our engine classifies system state as SAFE, MODERATE, or CRITICAL.
Only if the system is SAFE do we allow chaos and delete a service pod.
Kubernetes then self-heals automatically.
So the innovation is not chaos itself, but intelligent, explainable decision control before chaos.
