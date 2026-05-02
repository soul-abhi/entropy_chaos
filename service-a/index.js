const express = require('express');
const client = require('prom-client');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'service_a_' });
register.setDefaultLabels({ service: 'service-a' });

const requestCounter = new client.Counter({
    name: 'service_a_requests_total',
    help: 'Total number of /api requests',
    registers: [register],
});

const errorCounter = new client.Counter({
    name: 'service_a_request_errors_total',
    help: 'Total number of simulated /api errors',
    registers: [register],
});

const latencyHistogram = new client.Histogram({
    name: 'service_a_request_latency_ms',
    help: 'Latency of /api in milliseconds',
    buckets: [25, 50, 100, 200, 300, 500, 1000, 2000],
    registers: [register],
});

const latencyGauge = new client.Gauge({
    name: 'service_a_last_request_latency_ms',
    help: 'Last observed /api latency in milliseconds',
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

    cpuGauge.set({ service: 'service-a' }, Number(cpuPercent.toFixed(2)));
    memoryGauge.set({ service: 'service-a' }, Number(memoryPercent.toFixed(2)));

    lastCpuUsage = process.cpuUsage();
    lastCpuTime = now;
}

setInterval(updateResourceMetrics, 5000);
updateResourceMetrics();

app.get('/api', async (_req, res) => {
    requestCounter.inc();

    const latencyMs = Math.floor(Math.random() * 700) + 50;
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    latencyHistogram.observe(latencyMs);
    latencyGauge.set(latencyMs);

    const isError = Math.random() < 0.2;
    if (isError) {
        errorCounter.inc();
        return res.status(500).json({
            service: 'service-a',
            ok: false,
            message: 'Simulated transient failure',
            latencyMs,
        });
    }

    return res.json({
        service: 'service-a',
        ok: true,
        message: 'API response',
        latencyMs,
        timestamp: new Date().toISOString(),
    });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'UP', service: 'service-a' });
});

app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

app.listen(port, () => {
    console.log(`[service-a] listening on port ${port}`);
});
