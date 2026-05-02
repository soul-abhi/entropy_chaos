# Adaptive Chaos: Start From Minikube (Linux)

This guide assumes all prerequisites are already installed and configured.
It starts from cluster startup and runs the project end-to-end.

## 1) Start Minikube

```bash
cd /media/workdown/major-project/adaptive-chaos
minikube start --driver=docker
kubectl get nodes
```

## 2) Point Docker to Minikube

Build images directly inside Minikube's Docker daemon so Kubernetes can use local tags with `imagePullPolicy: Never`.

```bash
eval "$(minikube -p minikube docker-env --shell bash)"
```

## 3) Build Project Images

```bash
docker build -t adaptive-chaos-service-a:local ./service-a
docker build -t adaptive-chaos-service-b:local ./service-b
docker build -t adaptive-chaos-risk-engine:local ./risk-engine
```

## 4) Deploy Kubernetes Manifests

```bash
kubectl apply -f ./k8s/prometheus.yaml
kubectl apply -f ./k8s/grafana.yaml
kubectl apply -f ./k8s/services.yaml
kubectl apply -f ./k8s/deployments.yaml
```

## 5) Wait for Deployments

```bash
kubectl rollout status deployment/service-a --timeout=180s
kubectl rollout status deployment/service-b --timeout=180s
kubectl rollout status deployment/risk-engine --timeout=180s
kubectl rollout status deployment/prometheus --timeout=180s
kubectl rollout status deployment/grafana --timeout=180s
kubectl get pods
```

## 6) Open Port-Forwards (Use Separate Terminals)

Terminal 1:

```bash
kubectl port-forward svc/prometheus 9090:9090
```

Terminal 2:

```bash
kubectl port-forward svc/service-a 3000:3000
```

Terminal 3:

```bash
kubectl port-forward svc/risk-engine 3002:3002
```

Terminal 4 (optional live decisions):

```bash
kubectl logs deployment/risk-engine -f
```

Terminal 5 (Grafana UI):

```bash
kubectl port-forward svc/grafana 3003:3000
```

## 7) Demo / Validation

Open Prometheus:

- http://localhost:9090

Generate traffic to Service A:

```bash
for i in {1..100}; do
  curl -sS http://localhost:3000/api >/dev/null || true
  sleep 0.2
done
```

Check latest risk decision:

```bash
curl -sS http://localhost:3002/decision
```

Open Grafana visualization:

- http://localhost:3003
- login: admin
- password: admin

In Grafana, go to Explore and use these Prometheus queries:

- `rate(service_a_requests_total[1m])`
- `rate(service_a_request_errors_total[1m])`
- `avg_over_time(service_a_last_request_latency_ms[1m])`
- `avg(app_cpu_usage_percent)`
- `avg(app_memory_usage_percent)`

## 8) Optional Manual Chaos Trigger

From project root:

```bash
node ./chaos-module/chaos-injector.js app=service-a
```

## 9) Stop / Cleanup

Delete resources:

```bash
kubectl delete -f ./k8s/deployments.yaml
kubectl delete -f ./k8s/services.yaml
kubectl delete -f ./k8s/grafana.yaml
kubectl delete -f ./k8s/prometheus.yaml
```

Stop cluster:

```bash
minikube stop
```
