// risk-core.test.js — unit tests for the pure scoring/decision logic.
// Run with: node --test  (Node's built-in runner, no extra dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_WEIGHTS,
    SAFE_THRESHOLD,
    CRITICAL_THRESHOLD,
    loadWeights,
    normalizeMetrics,
    calculateRRS,
    classifySystem,
    decisionFromState,
} = require('../risk-core');

test('loadWeights uses defaults when env is empty', () => {
    assert.deepEqual(loadWeights({}), DEFAULT_WEIGHTS);
    assert.deepEqual(loadWeights(undefined), DEFAULT_WEIGHTS);
});

test('loadWeights reads W1..W4 from env', () => {
    const w = loadWeights({ W1: '0.5', W2: '0.3', W3: '0.1', W4: '0.1' });
    assert.deepEqual(w, { latency: 0.5, errorRate: 0.3, cpu: 0.1, memory: 0.1 });
});

test('normalizeMetrics maps mixed units onto 0-100', () => {
    assert.deepEqual(normalizeMetrics({ latencyMs: 0, errorRatePercent: 0, cpuPercent: 0, memoryPercent: 0 }), {
        latency: 0,
        errorRate: 0,
        cpu: 0,
        memory: 0,
    });
    // latency /10, error *2, cpu & memory passthrough.
    assert.deepEqual(normalizeMetrics({ latencyMs: 400, errorRatePercent: 5, cpuPercent: 20, memoryPercent: 40 }), {
        latency: 40,
        errorRate: 10,
        cpu: 20,
        memory: 40,
    });
});

test('normalizeMetrics caps each signal at 100', () => {
    const n = normalizeMetrics({ latencyMs: 5000, errorRatePercent: 99, cpuPercent: 250, memoryPercent: 500 });
    assert.equal(n.latency, 100);
    assert.equal(n.errorRate, 100);
    assert.equal(n.cpu, 100);
    assert.equal(n.memory, 100);
});

test('calculateRRS is a weighted sum using defaults', () => {
    // all-zero -> 0, all-100 -> 100.
    const zero = { latency: 0, errorRate: 0, cpu: 0, memory: 0 };
    const max = { latency: 100, errorRate: 100, cpu: 100, memory: 100 };
    assert.equal(calculateRRS(zero), 0);
    assert.equal(calculateRRS(max), 100);
    // 0.35*40 + 0.35*10 + 0.2*20 + 0.1*40 = 14 + 3.5 + 4 + 4 = 25.5
    assert.equal(
        calculateRRS({ latency: 40, errorRate: 10, cpu: 20, memory: 40 }),
        25.5
    );
});

test('calculateRRS honors explicit weights', () => {
    const w = { latency: 1, errorRate: 0, cpu: 0, memory: 0 };
    assert.equal(calculateRRS({ latency: 50, errorRate: 0, cpu: 0, memory: 0 }, w), 50);
});

test('classifySystem boundaries are exclusive to the thresholds', () => {
    assert.equal(classifySystem(0), 'SAFE');
    assert.equal(classifySystem(SAFE_THRESHOLD - 0.01), 'SAFE');
    assert.equal(classifySystem(SAFE_THRESHOLD), 'MODERATE');
    assert.equal(classifySystem(CRITICAL_THRESHOLD - 0.01), 'MODERATE');
    assert.equal(classifySystem(CRITICAL_THRESHOLD), 'CRITICAL');
});

test('decisionFromState only allows chaos in SAFE state', () => {
    assert.equal(decisionFromState('SAFE'), 'ALLOW_CHAOS');
    assert.equal(decisionFromState('MODERATE'), 'BLOCK_CHAOS');
    assert.equal(decisionFromState('CRITICAL'), 'BLOCK_CHAOS');
    assert.equal(decisionFromState('UNKNOWN'), 'BLOCK_CHAOS');
});

// Regression guard for the former FLAGGED-01 bug: with the tuned defaults
// (5% baseline failure rate, error-norm *2), a healthy Service A must score
// SAFE so the adaptive chaos loop can actually fire.
test('default healthy baseline reaches SAFE -> ALLOW_CHAOS (regression)', () => {
    const raw = { latencyMs: 400, errorRatePercent: 5, cpuPercent: 5, memoryPercent: 20 };
    const rrs = calculateRRS(normalizeMetrics(raw), DEFAULT_WEIGHTS);
    assert.ok(rrs < SAFE_THRESHOLD, `expected RRS < ${SAFE_THRESHOLD}, got ${rrs}`);
    assert.equal(classifySystem(rrs), 'SAFE');
    assert.equal(decisionFromState(classifySystem(rrs)), 'ALLOW_CHAOS');
});

test('default unhealthy baseline must block chaos', () => {
    const raw = { latencyMs: 900, errorRatePercent: 30, cpuPercent: 90, memoryPercent: 90 };
    const rrs = calculateRRS(normalizeMetrics(raw), DEFAULT_WEIGHTS);
    assert.equal(decisionFromState(classifySystem(rrs)), 'BLOCK_CHAOS');
});
