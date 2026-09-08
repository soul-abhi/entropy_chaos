// risk-core.js
// Pure, dependency-free scoring and decision helpers. No server, no I/O, no
// Prometheus — kept separate from index.js so the decision math is unit-testable
// and can later back both the Safety Controller and experiment selection.

const DEFAULT_WEIGHTS = {
    latency: 0.35,
    errorRate: 0.35,
    cpu: 0.2,
    memory: 0.1,
};

const SAFE_THRESHOLD = 40;
const CRITICAL_THRESHOLD = 70;

// Weights are read from the process environment (W1..W4) with these defaults.
function loadWeights(env) {
    const e = env || {};
    return {
        latency: Number(e.W1 ?? DEFAULT_WEIGHTS.latency),
        errorRate: Number(e.W2 ?? DEFAULT_WEIGHTS.errorRate),
        cpu: Number(e.W3 ?? DEFAULT_WEIGHTS.cpu),
        memory: Number(e.W4 ?? DEFAULT_WEIGHTS.memory),
    };
}

// Map raw metrics of mixed units onto one 0-100 scale so they can be summed.
function normalizeMetrics(raw) {
    return {
        latency: Math.min(raw.latencyMs / 10, 100), // 0-1000ms -> 0-100
        // 50% error rate saturates at 100; the 5% baseline reads as 10 (low risk).
        errorRate: Math.min(raw.errorRatePercent * 2, 100),
        cpu: Math.min(raw.cpuPercent, 100),
        memory: Math.min(raw.memoryPercent, 100),
    };
}

// Resilience Risk Score: a weighted sum of the four normalized signals.
function calculateRRS(normalized, weights) {
    const w = weights || DEFAULT_WEIGHTS;
    return (
        w.latency * normalized.latency +
        w.errorRate * normalized.errorRate +
        w.cpu * normalized.cpu +
        w.memory * normalized.memory
    );
}

// Classify the RRS into one of three observable system states.
function classifySystem(rrs) {
    if (rrs < SAFE_THRESHOLD) return 'SAFE';
    if (rrs < CRITICAL_THRESHOLD) return 'MODERATE';
    return 'CRITICAL';
}

// Start-decision. There is no running fault with adjustable intensity yet, so the
// only real lever is "start an experiment" or "do not start". MODERATE and
// CRITICAL both mean "do not start new chaos" (MODERATE is still surfaced as a
// distinct system state for observability). Genuine REDUCE/ABORT — tuning or
// killing a running experiment mid-flight — lands with trajectory control.
function decisionFromState(state) {
    return state === 'SAFE' ? 'ALLOW_CHAOS' : 'BLOCK_CHAOS';
}

module.exports = {
    DEFAULT_WEIGHTS,
    SAFE_THRESHOLD,
    CRITICAL_THRESHOLD,
    loadWeights,
    normalizeMetrics,
    calculateRRS,
    classifySystem,
    decisionFromState,
};
