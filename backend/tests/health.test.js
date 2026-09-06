import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL =
  process.env.TEST_API_BASE_URL ||
  'http://127.0.0.1:4000';

test('GET /health returns ok:true', async () => {
  const response = await fetch(`${BASE_URL}/health`);

  assert.equal(
    response.status,
    200,
    `Expected HTTP 200, received ${response.status}`
  );

  const body = await response.json();

  assert.equal(
    body.ok,
    true,
    'Expected response body to contain ok:true'
  );
});