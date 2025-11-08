const express = require('express');
const axios = require('axios');
const { execSync } = require('child_process');

const app = express();
const port = process.env.PORT || 3002;

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
const TARGET_LABEL = process.env.CHAOS_TARGET_LABEL || 'app=service-a';
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 30000);
const CHAOS_COOLDOWN_MS = Number(process.env.CHAOS_COOLDOWN_MS || 90000);

const WEIGHTS = {
    latency: Number(process.env.W1 || 0.35),
    errorRate: Number(process.env.W2 || 0.35),
    cpu: Number(process.env.W3 || 0.2),
    memory: Number(process.env.W4 || 0.1),
};

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
            return 0;
        }

        const value = (result[0].value?.[1]);
        return Number.isFinite(value) ? value : 0;
    } catch (error) {
        console.error(`[risk-engine] Prometheus query failed: ${query}`);
        console.error(`[risk-engine] ${error.message}`);
        return 0;
    }
}

function normalizeMetrics(raw) {
    return {
        latency: Math.min(raw.latencyMs / 10, 100),
        errorRate: Math.min(raw.errorRatePercent * 5, 100),
        cpu: Math.min(raw.cpuPercent, 100),
        memory: Math.min(raw.memoryPercent, 100),
    };
}

function calculateRRS(normalized) {
    return (
        WEIGHTS.latency * normalized.latency +
        WEIGHTS.errorRate * normalized.errorRate +
        WEIGHTS.cpu * normalized.cpu +
        WEIGHTS.memory * normalized.memory
    );
}

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

async function evaluateRiskAndAct() {
    const rawMetrics = {
        latencyMs: await queryPrometheus(
            'avg_over_time(service_a_last_request_latency_ms[1m])'
        ),
        errorRatePercent: await queryPrometheus(
            '(sum(rate(service_a_request_errors_total[1m])) / clamp_min(sum(rate(service_a_requests_total[1m])), 0.0001)) * 100'
        ),
        cpuPercent: await queryPrometheus('avg(app_cpu_usage_percent{service="service-a"})'),
        memoryPercent: await queryPrometheus('avg(app_memory_usage_percent{service="service-a"})'),
    };

    const normalizedMetrics = normalizeMetrics(rawMetrics);
    const rrs = calculateRRS(normalizedMetrics);
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

    evaluateRiskAndAct();
    setInterval(evaluateRiskAndAct, CHECK_INTERVAL_MS);
});
