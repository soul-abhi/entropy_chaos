const { execSync } = require('child_process');

const targetLabel = process.argv[2] || 'app=service-a';

function deleteOnePod(labelSelector) {
    const podName = execSync(
        `kubectl get pods -l ${labelSelector} -o jsonpath="{.items[0].metadata.name}"`,
        { encoding: 'utf-8' }
    ).trim();

    if (!podName) {
        throw new Error(`No pod found for selector: ${labelSelector}`);
    }

    execSync(`kubectl delete pod ${podName} --wait=false`, { stdio: 'inherit' });
    return podName;
}

try {
    const deletedPod = deleteOnePod(targetLabel);
    console.log(`[chaos-module] Deleted pod: ${deletedPod}`);
} catch (error) {
    console.error(`[chaos-module] Failed to delete pod: ${error.message}`);
    process.exit(1);
}
