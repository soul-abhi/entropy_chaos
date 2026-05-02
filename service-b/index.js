const express = require('express');
const client = require('prom-client');
const os = require('os');

const app = express();
const port = process.env.PORT || 3001;

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'service_b_' });
register.setDefaultLabels({ service: 'service-b' });

const workerCycles = new client.Counter({
    name: 'service_b_worker_cycles_total',
    help: 'Total worker cycles executed',
    registers: [register],
});

const cpuGauge = new client.Gauge({
    name: 'app_cpu_usage_percent',
    help: 'Approximate process CPU usage percent',
    labelNames: ['service'],
    registers: [register],
});

const memoryGauge = new client.Gauge({
    name: 'app_memory_usage_percent',
    help: 'Approximate process memory usage percent',
    labelNames: ['service'],
    registers: [register],
});

const workerLoadGauge = new client.Gauge({
    name: 'service_b_worker_load_score',
    help: 'Synthetic worker load score',
    registers: [register],
});

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

function updateResourceMetrics() {
    const now = Date.now();
    const elapsedMs = Math.max(now - lastCpuTime, 1);
    const currentCpuUsage = process.cpuUsage(lastCpuUsage);
    const usedMicros = currentCpuUsage.user + currentCpuUsage.system;
    const cpuPercent = Math.min(
        100,
        (usedMicros / (elapsedMs * 1000 * os.cpus().length)) * 100 * os.cpus().length
    );

    const memoryPercent = Math.min(
        100,
        (process.memoryUsage().rss / os.totalmem()) * 100
    );

    cpuGauge.set({ service: 'service-b' }, Number(cpuPercent.toFixed(2)));
    memoryGauge.set({ service: 'service-b' }, Number(memoryPercent.toFixed(2)));

    lastCpuUsage = process.cpuUsage();
    lastCpuTime = now;
}

function simulateWorkerCycle() {
    workerCycles.inc();
    const load = 30 + Math.floor(Math.random() * 70);
    workerLoadGauge.set(load);

    const busyMs = 20 + Math.floor(Math.random() * 80);
    const start = Date.now();
    while (Date.now() - start < busyMs) {
        Math.sqrt(Math.random() * 9999);
    }
}

setInterval(() => {
    simulateWorkerCycle();
    updateResourceMetrics();
}, 3000);

updateResourceMetrics();

app.get('/health', (_req, res) => {
    res.json({ status: 'UP', service: 'service-b' });
});

app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

app.listen(port, () => {
    console.log(`[service-b] listening on port ${port}`);
});
