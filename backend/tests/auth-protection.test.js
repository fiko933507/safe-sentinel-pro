import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL =
  process.env.TEST_API_BASE_URL ||
  'http://127.0.0.1:4000';

test('GET /api/me rejects request without authentication', async () => {
  const response = await fetch(`${BASE_URL}/api/me`);

  assert.ok(
    response.status === 401 || response.status === 403,
    `Expected HTTP 401 or 403, received ${response.status}`
  );
});

test('GET /api/me rejects invalid bearer token', async () => {
  const response = await fetch(`${BASE_URL}/api/me`, {
    headers: {
      Authorization: 'Bearer invalid-test-token'
    }
  });

  assert.ok(
    response.status === 401 || response.status === 403,
    `Expected HTTP 401 or 403, received ${response.status}`
  );
});