# Adaptive Risk-Aware Chaos Engineering Framework

## 1. Project Overview

This project is a local, containerized chaos engineering prototype for microservices. The core idea is to make chaos experiments decision-driven instead of random: the system first measures live risk from observability metrics, then decides whether it is safe to inject failure.

In practical terms, the project demonstrates a closed-loop control system:

1. collect metrics from running services,
2. calculate a resilience risk score,
3. classify the current system state,
4. allow, soften, or block chaos,
5. delete a pod only when the system is healthy enough,
6. let Kubernetes self-heal the service automatically.

## 2. Why This Project Exists

Traditional chaos experiments often run on a timer or a manual trigger. That can be useful, but it has a weakness: it can inject failure while the system is already struggling. This project exists to solve that problem by adding a safety gate.

The goal is to answer a more intelligent question before chaos runs:

"Is the system healthy enough right now to tolerate a fault injection?"

That makes the framework useful for:

1. resilience engineering demos,
2. academic or research prototypes,
3. local DevOps experimentation,
4. safe demonstrations of adaptive automation,
5. explaining how observability can drive control decisions.

## 3. The Problem Being Solved

The project is solving a common reliability problem in distributed systems: blind failure injection can create unnecessary instability.

Without a risk gate, chaos can:

1. make already unstable systems worse,
2. distort experiments by failing at the wrong time,
3. reduce trust in chaos testing,
4. make demonstrations hard to explain,
5. ignore live operational signals.

This prototype shows a more disciplined model: chaos is only allowed when live metrics suggest a safe window.

## 4. High-Level Architecture

The architecture is intentionally small and local so it can run on Docker Desktop or Minikube without cloud services.

```text
Service A  ---> metrics ---> Prometheus <--- metrics <--- Service B
     |                             |
     |                             v
     |                    Risk Engine queries
     |                             |
     v                             v
 /api, /health, /metrics     RRS calculation
                                   |
                                   v
                        SAFE / MODERATE / CRITICAL
                                   |
                                   v
                        kubectl delete pod <service-a-pod>
                                   |
                                   v
                        Kubernetes recreates pod
```

### Main Components

1. Service A: user-facing API service with simulated latency and random errors.
2. Service B: background worker simulation that produces load metrics.
3. Prometheus: scrapes metrics from both services.
4. Risk Engine: queries Prometheus, computes risk, and decides whether to inject chaos.
5. Kubernetes: runs the workloads and recreates pods after deletion.
6. Chaos Module: optional manual helper for deleting a pod directly.

## 5. Step-by-Step Execution Flow

This is the actual operational loop of the system.

### Step 1: Services start inside Kubernetes

The manifests deploy:

1. two replicas of Service A,
2. one replica of Service B,
3. one replica of the Risk Engine,
4. one Prometheus instance,
5. RBAC permissions for the Risk Engine so it can delete pods.

### Step 2: Services expose metrics

Service A and Service B export `/metrics` endpoints using `prom-client`.

### Step 3: Prometheus scrapes the metrics

Prometheus scrapes both services every 5 seconds using the config in `k8s/prometheus.yaml`.

### Step 4: Risk Engine reads live values

Every 30 seconds, the Risk Engine queries Prometheus for:

1. latency,
2. error rate,
3. CPU usage,
4. memory usage.

### Step 5: Metrics are normalized

Raw metric values are converted to a common 0 to 100 scale so they can be combined.

### Step 6: Risk score is calculated

The weighted risk score is computed as:

RRS = (W1 × Latency) + (W2 × ErrorRate) + (W3 × CPU) + (W4 × Memory)

Default weights in the project are:

1. latency = 0.35,
2. error rate = 0.35,
3. CPU = 0.20,
4. memory = 0.10.

### Step 7: System state is classified

The score is mapped to one of three states:

1. SAFE if RRS < 40,
2. MODERATE if 40 <= RRS < 70,
3. CRITICAL if RRS >= 70.

### Step 8: Chaos decision is made

The state becomes one of three actions:

1. SAFE -> ALLOW_CHAOS,
2. MODERATE -> REDUCE_INTENSITY,
3. CRITICAL -> BLOCK_CHAOS.

### Step 9: Pod deletion happens only when safe

If the decision is ALLOW_CHAOS and the cooldown has expired, the Risk Engine deletes one pod labeled `app=service-a`.

### Step 10: Kubernetes self-heals

The deleted Service A pod is recreated automatically by the Deployment controller.

## 6. Code Explanation by File

### 6.1 `service-a/index.js`

This file implements the main API service.

What it does:

1. starts an Express server on port 3000,
2. exposes `/api`, `/health`, and `/metrics`,
3. simulates latency in `/api`,
4. randomly returns failures with a 20 percent chance,
5. records request counts, errors, latency, CPU, and memory,
6. exports Prometheus-compatible metrics.

Important behavior:

1. `/api` waits a random time before responding, so latency is not constant.
2. `/api` sometimes returns HTTP 500 to simulate transient faults.
3. `/metrics` publishes both default process metrics and custom business metrics.

Why this matters:

This service gives the Risk Engine something meaningful to observe and score.

### 6.2 `service-b/index.js`

This file implements a synthetic worker service.

What it does:

1. starts an Express server on port 3001,
2. exposes `/health` and `/metrics`,
3. runs a background loop every 3 seconds,
4. simulates worker cycles and CPU-like activity,
5. publishes worker load, CPU, and memory metrics.

Why this matters:

Service B acts as a second workload so the system has more than one observable component and can demonstrate multi-service monitoring.

### 6.3 `risk-engine/index.js`

This is the control center of the whole project.

What it does:

1. starts an Express server on port 3002,
2. queries Prometheus using Axios,
3. reads latency, error rate, CPU, and memory metrics,
4. normalizes the values,
5. calculates RRS,
6. classifies the system state,
7. decides whether chaos is allowed,
8. deletes a Service A pod using kubectl when allowed,
9. exposes `/decision` so the last evaluation can be inspected.

Important safeguards:

1. there is a cooldown to avoid repeated pod deletions too quickly,
2. the action only happens in SAFE state,
3. the pod selector is configurable through `CHAOS_TARGET_LABEL`,
4. the Prometheus URL is configurable through `PROMETHEUS_URL`.

This file is the best place to understand the project’s central logic.

### 6.4 `chaos-module/chaos-injector.js`

This is a manual helper script.

What it does:

1. accepts a label selector argument,
2. finds one pod with `kubectl get pods -l ...`,
3. deletes that pod,
4. exits with an error if no pod is found.

Why it exists:

It provides a manual way to reproduce the same chaos action outside the Risk Engine.

### 6.5 Kubernetes manifests

#### `k8s/deployments.yaml`

This file defines:

1. Service A deployment with 2 replicas,
2. Service B deployment with 1 replica,
3. Risk Engine deployment with its service account,
4. RBAC role and binding so the Risk Engine can manage pods.

#### `k8s/services.yaml`

This file exposes the workloads inside the cluster using Kubernetes Services:

1. service-a on port 3000,
2. service-b on port 3001,
3. risk-engine on port 3002,
4. prometheus on port 9090.

#### `k8s/prometheus.yaml`

This file contains:

1. a ConfigMap with the Prometheus scrape configuration,
2. a Prometheus deployment,
3. scrape targets for Service A and Service B.

### 6.6 `scripts/run-all.ps1` and `RUN-EMERGENCY.cmd`

These are convenience scripts for demo execution.

`scripts/run-all.ps1` does the following:

1. validates Docker, Minikube, and kubectl,
2. starts Minikube if needed,
3. builds the three container images,
4. applies Kubernetes manifests,
5. waits for rollouts,
6. opens helper terminals for port-forwarding and logs,
7. optionally opens the Minikube dashboard.

`RUN-EMERGENCY.cmd` is a simple Windows launcher that calls the PowerShell script.

## 7. Container Strategy

The repository is designed around container-first execution.

### Container images

1. `service-a/Dockerfile` builds a Node 20 Alpine image for Service A.
2. `service-b/Dockerfile` builds a Node 20 Alpine image for Service B.
3. `risk-engine/Dockerfile` builds a Node 20 Alpine image and installs `kubectl` inside the container.

### Why containers are used

1. they make the demo repeatable,
2. they isolate each component,
3. they let Prometheus and the Risk Engine talk through cluster services,
4. they allow the pod-deletion behavior to be demonstrated realistically,
5. they keep the setup local and portable.

### Build commands

The project builds the images locally and tags them with `:local`.

```powershell
docker build -t adaptive-chaos-service-a:local ./service-a
docker build -t adaptive-chaos-service-b:local ./service-b
docker build -t adaptive-chaos-risk-engine:local ./risk-engine
```

## 8. Tech Stack

The project uses the following stack:

1. Node.js 20,
2. Express,
3. prom-client,
4. Axios,
5. Docker,
6. Kubernetes,
7. Minikube or Docker Desktop Kubernetes,
8. Prometheus,
9. kubectl,
10. PowerShell for orchestration.

## 9. How to Run the Project

### Option 1: Fast demo path

1. Install Docker Desktop, Node.js, kubectl, and Minikube.
2. Start Minikube.
3. Build the images.
4. Apply the Kubernetes manifests.
5. Open Prometheus, Service A, and Risk Engine through port-forwarding.
6. Generate traffic to Service A.
7. Watch the Risk Engine logs for risk decisions and chaos actions.

### Option 2: One-click helper

Run the emergency script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1
```

Optional flags:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1 -SkipBuild
powershell -ExecutionPolicy Bypass -File .\scripts\run-all.ps1 -NoDashboard
```

### Option 3: Manual Kubernetes flow

```powershell
minikube start --driver=docker
kubectl apply -f .\k8s\prometheus.yaml
kubectl apply -f .\k8s\services.yaml
kubectl apply -f .\k8s\deployments.yaml
kubectl get pods -w
```

## 10. What You Will See During a Demo

1. Service A starts serving `/api` requests.
2. Service B runs worker cycles in the background.
3. Prometheus collects metrics from both services.
4. The Risk Engine prints current metrics and RRS values.
5. The system state becomes SAFE, MODERATE, or CRITICAL.
6. When SAFE, a Service A pod is deleted.
7. Kubernetes recreates it automatically.

This produces an explainable demo of resilient behavior under controlled failure.

## 11. Security and Access Model

The only significant cluster permission in the prototype is pod deletion by the Risk Engine.

RBAC objects in `k8s/deployments.yaml` grant:

1. get,
2. list,
3. watch,
4. delete

permissions on pods.

This is enough for the demo, but in a real production design you would tighten the scope further.

## 12. Design Choices

The project intentionally chooses simple, transparent mechanisms.

1. Rule-based scoring instead of machine learning.
2. Local Kubernetes instead of cloud deployment.
3. Pod deletion instead of more complex fault injection.
4. Prometheus metrics instead of proprietary observability tooling.
5. Kubernetes self-healing instead of custom rollback logic.

These choices make the prototype easy to understand, reproduce, and present.

## 13. Current Limitations

This is a prototype, so it is intentionally limited.

1. No persistent data layer.
2. No authentication or tenant isolation.
3. No real ML-based risk prediction.
4. No advanced network or disk fault injection.
5. No production-grade observability dashboards beyond Prometheus.

## 14. Future Direction

The likely next evolution steps are:

1. add richer fault types beyond pod deletion,
2. make scoring adaptive from historical data,
3. add dashboards and reporting,
4. expand to more services,
5. integrate with CI/CD gates,
6. improve policy controls and safety checks.

## 15. Short Summary

This project is a local adaptive chaos engineering framework. It monitors services, computes a risk score, decides whether the system is healthy enough, and only then injects a controlled failure. The main value is not chaos by itself, but the explainable decision layer that sits in front of chaos.
