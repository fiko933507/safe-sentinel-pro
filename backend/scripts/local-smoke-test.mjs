const BASE_URL = String(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 30000);
const HEALTH_ATTEMPTS = Number(process.env.SMOKE_HEALTH_ATTEMPTS || 3);

let failures = 0;

const log = (status, name, detail = '') => {
  console.log(`${status.padEnd(5)} ${name}${detail ? ` — ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const headers = {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });

    let body = null;
    if (response.status !== 204) {
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
    }

    return { response, body, durationMs: Date.now() - startedAt };
  } catch (error) {
    const timeoutDetail = error?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : (error?.message || String(error));
    throw new Error(`${path} ${timeoutDetail}`);
  } finally {
    clearTimeout(timeout);
  }
};

const expect = (condition, name, detail = '') => {
  if (condition) {
    log('PASS', name, detail);
  } else {
    failures += 1;
    log('FAIL', name, detail);
  }
};

const checkHealth = async () => {
  let lastError;
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    try {
      const result = await request('/health');
      if (result.response.status === 200 && result.body?.ok === true && result.body?.database === 'connected') {
        log('PASS', 'Health + PostgreSQL', `HTTP ${result.response.status}, ${result.durationMs}ms, attempt ${attempt}/${HEALTH_ATTEMPTS}`);
        return true;
      }
      lastError = new Error(`/health returned HTTP ${result.response.status}`);
    } catch (error) {
      lastError = error;
    }

    log('WAIT', 'Production API warm-up', `attempt ${attempt}/${HEALTH_ATTEMPTS}: ${lastError?.message || lastError}`);
    if (attempt < HEALTH_ATTEMPTS) await sleep(5000);
  }

  failures += 1;
  log('FAIL', 'Health + PostgreSQL', lastError?.message || String(lastError));
  return false;
};

const runCheck = async (name, path, options, expectedStatus) => {
  try {
    const { response, durationMs } = await request(path, options);
    expect(response.status === expectedStatus, name, `HTTP ${response.status}, ${durationMs}ms`);
  } catch (error) {
    failures += 1;
    log('FAIL', name, error?.message || String(error));
  }
};

console.log(`Safe Sentinel Pro private-beta smoke test: ${BASE_URL}`);

const healthy = await checkHealth();
if (healthy) {
  await runCheck('Protected /api/me rejects anonymous access', '/api/me', {}, 401);
  await runCheck('Invalid JWT rejected', '/api/me', {
    headers: { Authorization: 'Bearer definitely-invalid-token' }
  }, 401);
  await runCheck('Wallet scan rejects anonymous access', '/api/check-wallet', {
    method: 'POST',
    body: JSON.stringify({ network: 'ethereum', address: '0x0000000000000000000000000000000000000000' })
  }, 401);
}

if (failures > 0) {
  console.error(`\nSMOKE TEST FAILED: ${failures} kontrol başarısız.`);
  process.exit(1);
}

console.log('\nSMOKE TEST PASSED');
