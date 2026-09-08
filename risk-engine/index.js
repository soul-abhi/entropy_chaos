const express = require('express');
const axios = require('axios');
const { execSync } = require('child_process');

const {
    loadWeights,
    normalizeMetrics,
    calculateRRS,
    classifySystem,
    decisionFromState,
} = require('./risk-core');

const app = express();
const port = process.env.PORT || 3002;

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
const TARGET_LABEL = process.env.CHAOS_TARGET_LABEL || 'app=service-a';
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 30000);
const CHAOS_COOLDOWN_MS = Number(process.env.CHAOS_COOLDOWN_MS || 90000);
const WEIGHTS = loadWeights(process.env);

// When true, skip Prometheus and feed deterministic low-risk metrics so the
// full SAFE -> ALLOW_CHAOS -> DELETED_POD -> self-heal cycle is reproducible
// for a demo, independent of live conditions.
const DEMO_SAFE_MODE = process.env.DEMO_SAFE_MODE === 'true';
const DEMO_SAFE_METRICS = { latencyMs: 120, errorRatePercent: 0.2, cpuPercent: 5, memoryPercent: 20 };

let lastDecision = {
    timestamp: null,
    rawMetrics: null,
    normalizedMetrics: null,
    rrs: null,
    systemState: 'UNKNOWN',
    decision: 'BLOCK_CHAOS',
    chaosAction: 'SKIPPED',
};

let lastChaosAt = 0;

async function queryPrometheus(query) {
    try {
        const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
            params: { query },
            timeout: 5000,
        });

        const result = response.data?.data?.result;
        if (!Array.isArray(result) || result.length === 0) {
            return null;
        }

        const value = Number(result[0].value?.[1]);
        return Number.isFinite(value) ? value : null;
    } catch (error) {
        console.error(`[risk-engine] Prometheus query failed: ${query}`);
        console.error(`[risk-engine] ${error.message}`);
        return null;
    }
}

async function collectMetrics() {
    if (DEMO_SAFE_MODE) {
        console.log('[risk-engine] DEMO_SAFE_MODE active — using deterministic safe metrics');
        return { ...DEMO_SAFE_METRICS };
    }

    const [latencyMs, errorRatePercent, cpuPercent, memoryPercent] = await Promise.all([
        queryPrometheus('avg_over_time(service_a_last_request_latency_ms[1m])'),
        queryPrometheus(
            '(sum(rate(service_a_request_errors_total[1m])) / clamp_min(sum(rate(service_a_requests_total[1m])), 0.0001)) * 100'
        ),
        queryPrometheus('avg(app_cpu_usage_percent{service="service-a"})'),
        queryPrometheus('avg(app_memory_usage_percent{service="service-a"})'),
    ]);

    return { latencyMs, errorRatePercent, cpuPercent, memoryPercent };
}

// Fail-closed: any metric we cannot observe means we cannot confirm the system
// is healthy enough to absorb a fault, so chaos must be blocked.
function hasObservability(metrics) {
    return (
        metrics.latencyMs !== null &&
        metrics.errorRatePercent !== null &&
        metrics.cpuPercent !== null &&
        metrics.memoryPercent !== null
    );
}

async function evaluateRiskAndAct() {
    const rawMetrics = await collectMetrics();

    if (!hasObservability(rawMetrics)) {
        lastDecision = {
            timestamp: new Date().toISOString(),
            rawMetrics,
            normalizedMetrics: null,
            rrs: null,
            systemState: 'UNKNOWN',
            decision: 'BLOCK_CHAOS',
            chaosAction: 'BLOCKED_OBSERVABILITY_LOSS',
        };
        console.error('[risk-engine] Observability degraded or lost; chaos BLOCKED (fail-closed).');
        return;
    }

    const normalizedMetrics = normalizeMetrics(rawMetrics);
    const rrs = calculateRRS(normalizedMetrics, WEIGHTS);
    const systemState = classifySystem(rrs);
    const decision = decisionFromState(systemState);
    const chaosAction = tryInjectChaos(decision);

    lastDecision = {
        timestamp: new Date().toISOString(),
        rawMetrics,
        normalizedMetrics,
        rrs: Number(rrs.toFixed(2)),
        systemState,
        decision,
        chaosAction,
    };

    console.log('-------------------------------------------------');
    console.log(`[risk-engine] Current Metrics: ${JSON.stringify(rawMetrics)}`);
    console.log(`[risk-engine] Current RRS: ${lastDecision.rrs}`);
    console.log(`[risk-engine] Current System State: ${systemState}`);
    console.log(`[risk-engine] Chaos Decision: ${decision}`);
    console.log(`[risk-engine] Chaos Action: ${chaosAction}`);
    console.log('-------------------------------------------------');
}

function deleteOneTargetPod() {
    const podName = execSync(
        `kubectl get pods -l ${TARGET_LABEL} -o jsonpath="{.items[0].metadata.name}"`,
        { encoding: 'utf-8' }
    ).trim();

    if (!podName) {
        throw new Error(`No pod found for selector: ${TARGET_LABEL}`);
    }

    execSync(`kubectl delete pod ${podName} --wait=false`, { stdio: 'inherit' });
    return podName;
}

function tryInjectChaos(decision) {
    if (decision !== 'ALLOW_CHAOS') {
        return 'SKIPPED';
    }

    const now = Date.now();
    if (now - lastChaosAt < CHAOS_COOLDOWN_MS) {
        return 'SKIPPED_COOLDOWN';
    }

    try {
        const deletedPod = deleteOneTargetPod();
        lastChaosAt = now;
        console.log(`[risk-engine] Chaos action executed: deleted pod ${deletedPod}`);
        return `DELETED_POD:${deletedPod}`;
    } catch (error) {
        console.error(`[risk-engine] Chaos action failed: ${error.message}`);
        return 'FAILED';
    }
}

app.get('/health', (_req, res) => {
    res.json({ status: 'UP', service: 'risk-engine' });
});

app.get('/decision', (_req, res) => {
    res.json(lastDecision);
});

app.listen(port, () => {
    console.log(`[risk-engine] listening on port ${port}`);
    console.log(`[risk-engine] Prometheus URL: ${PROMETHEUS_URL}`);
    console.log(`[risk-engine] Check interval: ${CHECK_INTERVAL_MS}ms`);
    console.log(`[risk-engine] Chaos target selector: ${TARGET_LABEL}`);
    console.log(`[risk-engine] DEMO_SAFE_MODE: ${DEMO_SAFE_MODE}`);

    evaluateRiskAndAct();
    setInterval(evaluateRiskAndAct, CHECK_INTERVAL_MS);
});
