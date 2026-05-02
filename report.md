# Adaptive Chaos Project Report

Date: 2026-05-01

## Executive Summary
This repository is a local, containerized chaos engineering prototype for microservices. It implements a closed-loop control system: Prometheus scrapes live metrics from two services, a risk engine computes a resilience risk score (RRS), and chaos is only injected (pod deletion) when the system is safe. The project is scoped for a local Minikube demo and prioritizes explainability over production hardening.

## What Is Done So Far
- Core services are implemented (Service A, Service B, Risk Engine).
- Metrics collection and Prometheus scraping are wired.
- Risk scoring and state classification are implemented and running on a timer.
- Controlled chaos injection (pod delete) is functional with a cooldown.
- Kubernetes manifests for deployments, services, Prometheus, and Grafana exist.
- Local run instructions for Linux and Windows are documented.

Status: Demo-ready prototype with end-to-end flow working locally.

## Project Architecture (High-Level)
- Service A exposes /api, /health, and /metrics.
- Service B simulates background load and exposes /metrics.
- Prometheus scrapes both services every 5 seconds.
- Risk Engine queries Prometheus every 30 seconds, computes RRS, and decides whether to inject chaos.
- If SAFE, Risk Engine deletes one Service A pod; Kubernetes recreates it.

## Files and Responsibilities

### Root
- PROJECT_DESCRIPTION.md: Detailed concept and step-by-step flow explanation.
- README.md: Full project overview, architecture, and setup guide (Windows-oriented).
- START_FROM_MINIKUBE.md: Linux-focused run instructions and demo steps.
- RUN-EMERGENCY.cmd: Windows helper to launch the PowerShell demo script.

### chaos-module/
- chaos-injector.js: Manual helper to delete one pod by label selector using kubectl.
- README.md: Usage notes for the manual chaos helper.

### k8s/
- deployments.yaml: Deployments for Service A, Service B, Risk Engine; RBAC for pod deletion.
- services.yaml: Cluster services for Service A, Service B, Risk Engine, Prometheus.
- prometheus.yaml: Prometheus config and deployment for scraping metrics.
- grafana.yaml: Grafana deployment and datasource config to Prometheus.

### risk-engine/
- index.js: Core control loop. Queries Prometheus, normalizes metrics, computes RRS, classifies state, and deletes a Service A pod when SAFE with cooldown.
- package.json: Runtime dependencies (express, axios).
- Dockerfile: Node 20 Alpine image with kubectl installed for in-cluster pod deletion.

### service-a/
- index.js: Express API with simulated latency and error rate; exports Prometheus metrics; tracks CPU and memory gauges.
- package.json: Runtime dependencies (express, prom-client).
- Dockerfile: Node 20 Alpine image.

### service-b/
- index.js: Background worker simulator; exports metrics for load, CPU, memory.
- package.json: Runtime dependencies (express, prom-client).
- Dockerfile: Node 20 Alpine image.

### scripts/
- run-all.ps1: Windows orchestration script for Minikube, builds, deploys, and port-forwards.

## Sensitive Information Found
- Grafana admin credentials are hardcoded to admin/admin in k8s/grafana.yaml.
- No other credentials, secrets, or API keys are present in the repository content scanned.

## Current Risk Scoring Logic
- Metrics: latency, error rate, CPU usage, memory usage.
- Weights: latency 0.35, error rate 0.35, CPU 0.20, memory 0.10.
- Thresholds: SAFE < 40, MODERATE 40-69, CRITICAL >= 70.
- Action: only SAFE allows chaos; MODERATE reduces intensity; CRITICAL blocks.

## Scaling Opinion (1 to 10)
Score: 6/10.
Reasoning: The core loop is solid and well explained, with observability, automation, and Kubernetes integration. It is still a prototype: no persistence, limited failure modes, no auth, no multi-service dependency modeling, and minimal production hardening.

## Suggestions to Scale This Up
1) Harden the control plane
- Add authentication and authorization for the Risk Engine API.
- Replace shelling out to kubectl with Kubernetes API client for reliability and auditability.
- Add structured logging and centralized log collection.

2) Expand chaos actions
- Add network latency/packet loss, CPU throttling, memory pressure, and dependency failure.
- Use a chaos toolkit (LitmusChaos or Chaos Mesh) for richer experiments.

3) Improve risk scoring
- Add SLO-based metrics (error budgets, tail latency) and per-service weighting.
- Introduce sliding windows, anomaly detection, or a basic ML model.
- Store time-series decisions for later analysis.

4) Production readiness
- Use namespaces and RBAC scoped to only target workloads.
- Add dashboards and alerts for risk score and decisions.
- Add CI/CD pipelines and automated tests.

5) Multi-service realism
- Add a data store or queue and model dependency health.
- Simulate partial outages and cascading failures.

## What To Learn to Build and Scale This From Scratch
1) Kubernetes fundamentals
- Deployments, Services, ConfigMaps, RBAC, namespaces, and rollouts.

2) Observability
- Prometheus metrics, PromQL, Grafana dashboards, alerting concepts.

3) Chaos engineering
- Failure modes, blast radius, and experiment design.
- Tooling: LitmusChaos, Chaos Mesh, or Gremlin concepts.

4) Backend engineering
- Node.js/Express (or Go), API design, metrics instrumentation.

5) Reliability engineering
- SLOs, error budgets, incident response, and resilience patterns.

## Gaps and Next Milestones
- Add persistent storage for risk decisions and experiments.
- Replace kubectl exec with Kubernetes API client.
- Expand to 3+ services and add a dependency graph.
- Add dashboards for RRS and decision history.
- Add test coverage and load tests to validate behavior.
