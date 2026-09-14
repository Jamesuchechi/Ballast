/**
 * Pings the background worker's HTTP endpoint to wake it up if sleeping.
 * This is crucial for Render Free Tier Web Services, which spin down after 15 minutes of inactivity.
 * Pinging /health triggers Render to spin up the container within seconds.
 */
export function wakeWorker(): void {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl) {
    return;
  }

  const cleanUrl = workerUrl.replace(/\/+$/, '');
  const target = `${cleanUrl}/health`;

  // Asynchronous fire-and-forget ping with a short timeout
  fetch(target, {
    method: 'GET',
    headers: { 'User-Agent': 'Ballast-Wakeup/1.0' },
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Intentionally suppressed. Even if the request times out during cold start,
    // Render's ingress proxy receives the connection and triggers container spin-up.
  });
}
