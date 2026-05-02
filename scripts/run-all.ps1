param(
    [switch]$SkipBuild,
    [switch]$NoDashboard
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Ensure-Command {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Required command '$Name' not found in PATH."
    }
}

function Start-ProjectTerminal {
    param(
        [string]$Title,
        [string]$Command,
        [string]$ProjectRoot
    )

    $bootstrap = @"
`$env:Path += ';C:\Program Files\Kubernetes\Minikube;C:\Program Files\Docker\Docker\resources\bin'
Set-Location '$ProjectRoot'
$Command
"@

    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "`$host.UI.RawUI.WindowTitle = '$Title'; $bootstrap"
    ) | Out-Null
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

Write-Step 'Preparing PATH for this session'
$env:Path += ';C:\Program Files\Kubernetes\Minikube;C:\Program Files\Docker\Docker\resources\bin'

Write-Step 'Validating required tools'
Ensure-Command minikube
Ensure-Command docker
Ensure-Command kubectl

Write-Step 'Checking Docker daemon'
$null = docker info

Write-Step 'Starting/validating Minikube cluster'
minikube start --driver=docker | Out-Host

Write-Step 'Switching Docker CLI to Minikube daemon'
$dockerEnv = minikube -p minikube docker-env --shell powershell
$dockerEnv | Invoke-Expression

if (-not $SkipBuild) {
    Write-Step 'Building container images'
    docker build -t adaptive-chaos-service-a:local .\service-a | Out-Host
    docker build -t adaptive-chaos-service-b:local .\service-b | Out-Host
    docker build -t adaptive-chaos-risk-engine:local .\risk-engine | Out-Host
}

Write-Step 'Deploying Kubernetes manifests'
kubectl apply -f .\k8s\prometheus.yaml | Out-Host
kubectl apply -f .\k8s\services.yaml | Out-Host
kubectl apply -f .\k8s\deployments.yaml | Out-Host

Write-Step 'Waiting for rollouts'
kubectl rollout status deployment/service-a --timeout=180s | Out-Host
kubectl rollout status deployment/service-b --timeout=180s | Out-Host
kubectl rollout status deployment/risk-engine --timeout=180s | Out-Host

Write-Step 'Opening helper terminals'
Start-ProjectTerminal -Title 'Adaptive Chaos - Prometheus PortForward' -Command 'kubectl port-forward svc/prometheus 9090:9090' -ProjectRoot $projectRoot
Start-ProjectTerminal -Title 'Adaptive Chaos - Service A PortForward' -Command 'kubectl port-forward svc/service-a 3000:3000' -ProjectRoot $projectRoot
Start-ProjectTerminal -Title 'Adaptive Chaos - Risk Engine PortForward' -Command 'kubectl port-forward svc/risk-engine 3002:3002' -ProjectRoot $projectRoot
Start-ProjectTerminal -Title 'Adaptive Chaos - Risk Engine Logs' -Command 'kubectl logs deployment/risk-engine -f' -ProjectRoot $projectRoot

if (-not $NoDashboard) {
    Start-ProjectTerminal -Title 'Adaptive Chaos - Minikube Dashboard' -Command 'minikube dashboard' -ProjectRoot $projectRoot
}

Write-Step 'Demo URLs'
Write-Host 'Prometheus GUI:   http://localhost:9090'
Write-Host 'Service A API:    http://localhost:3000/api'
Write-Host 'Risk decision API:http://localhost:3002/decision'
Write-Host ''
Write-Host 'Emergency one-click run complete.' -ForegroundColor Green
