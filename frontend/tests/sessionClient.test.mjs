import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from '../src/api/client.js';

for (const status of [401, 403]) {
  test(`a protected request returning ${status} keeps its original identity and is never replayed`, async (t) => {
    const response = t.mock.method(globalThis, 'fetch', async () => Response.json(
      { detail: 'Không có quyền thực hiện yêu cầu' }, { status },
    ));
    await assert.rejects(
      request('/sales-copilot/tasks', { method: 'POST', body: '{}' }),
      (error) => error.status === status,
    );
    assert.deepEqual(response.mock.calls.map(({ arguments: args }) => args[0]), ['/api/v1/sales-copilot/tasks']);
  });
}
