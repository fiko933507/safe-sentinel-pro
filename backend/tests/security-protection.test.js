import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL =
  process.env.TEST_API_BASE_URL ||
  'http://127.0.0.1:4000';

const protectedEndpoints = [
  '/api/wallet-behavioral-fingerprint',
  '/api/scam-dna',
  '/api/wallet-security-graph',
  '/api/early-warning',
  '/api/analyze-contract-v2',
  '/api/guardian/evaluate'
];

for (const endpoint of protectedEndpoints) {

  test(`POST ${endpoint} rejects request without authentication`, async () => {

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    assert.ok(
      response.status === 401 || response.status === 403,
      `Expected HTTP 401 or 403 from ${endpoint}, received ${response.status}`
    );
  });

}