import test from 'node:test';
import assert from 'node:assert/strict';

const recovery = await import('./productFiscalRecovery.ts').catch((error) => {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

function scenario(outcomes = []) {
  let createdProductId = null;
  let postCount = 0;
  const puts = [];
  const calls = [];
  return {
    get createdProductId() { return createdProductId; },
    get postCount() { return postCount; },
    puts,
    calls,
    submit(values, save = true) {
      return recovery.submitProductWithFiscalRecovery({
        createdProductId,
        fiscalValues: values,
        createProduct: async () => { postCount += 1; calls.push('POST'); return 'product-123'; },
        onCreated: (id) => { createdProductId = id; },
        saveFiscal: save ? async (id, currentValues) => {
          puts.push({ id, values: { ...currentValues } });
          calls.push('PUT');
          const outcome = outcomes.shift();
          if (outcome) throw outcome;
        } : null,
      });
    },
  };
}

test('POST then successful fiscal PUT completes the normal flow', async () => {
  assert.equal(typeof recovery.submitProductWithFiscalRecovery, 'function');
  const flow = scenario();
  const result = await flow.submit({ ncm: '33059000' });
  assert.equal(result.status, 'complete');
  assert.equal(result.productId, 'product-123');
  assert.deepEqual(flow.calls, ['POST', 'PUT']);
});

test('fiscal failure preserves product ID and entered fiscal values without completion', async () => {
  const flow = scenario([new Error('NCM inválido')]);
  const values = { ncm: '3305900', unit: 'UN' };
  const result = await flow.submit(values);
  assert.equal(result.status, 'fiscal-recovery');
  assert.equal(result.productId, 'product-123');
  assert.equal(flow.createdProductId, 'product-123');
  assert.deepEqual(values, { ncm: '3305900', unit: 'UN' });
  assert.match(result.error.message, /NCM inválido/);
});

test('first retry sends only fiscal PUT to the same product', async () => {
  const flow = scenario([new Error('falha'), new Error('falha')]);
  await flow.submit({ ncm: '1' });
  await flow.submit({ ncm: '2' });
  assert.deepEqual(flow.calls, ['POST', 'PUT', 'PUT']);
  assert.equal(flow.postCount, 1);
  assert.deepEqual(flow.puts.map(({ id }) => id), ['product-123', 'product-123']);
});

test('second failed retry remains in recovery and retains the current values', async () => {
  const flow = scenario([new Error('falha 1'), new Error('falha 2'), new Error('falha 3')]);
  await flow.submit({ ncm: '1' });
  await flow.submit({ ncm: '2' });
  const currentValues = { ncm: '3' };
  const result = await flow.submit(currentValues);
  assert.equal(result.status, 'fiscal-recovery');
  assert.equal(flow.createdProductId, 'product-123');
  assert.deepEqual(flow.calls, ['POST', 'PUT', 'PUT', 'PUT']);
  assert.deepEqual(currentValues, { ncm: '3' });
});

test('successful retry completes recovery and allows the page to redirect', async () => {
  const flow = scenario([new Error('falha')]);
  await flow.submit({ ncm: '1' });
  const result = await flow.submit({ ncm: '33059000' });
  assert.equal(result.status, 'complete');
  assert.equal(result.productId, 'product-123');
  assert.deepEqual(flow.calls, ['POST', 'PUT', 'PUT']);
});

test('retry uses values edited after the fiscal failure', async () => {
  const flow = scenario([new Error('falha')]);
  await flow.submit({ ncm: '123' });
  await flow.submit({ ncm: '33059000' });
  assert.equal(flow.puts[1].values.ncm, '33059000');
});

test('an existing product ID structurally prevents every later POST', async () => {
  const flow = scenario([new Error('falha'), new Error('falha')]);
  await flow.submit({ ncm: '1' });
  await flow.submit({ ncm: '2' });
  await flow.submit({ ncm: '3' });
  assert.equal(flow.postCount, 1);
  assert.deepEqual(flow.calls, ['POST', 'PUT', 'PUT', 'PUT']);
});

test('product without fiscal values skips PUT and completes normally', async () => {
  const flow = scenario();
  const result = await flow.submit({}, false);
  assert.equal(result.status, 'complete');
  assert.deepEqual(flow.calls, ['POST']);
});

test('post-create media work finishes before fiscal PUT and is never repeated by fiscal retry', async () => {
  let createdProductId = null;
  const calls = [];
  const options = {
    fiscalValues: { ncm: '33059000' },
    createProduct: async () => { calls.push('POST'); return 'product-123'; },
    onCreated: (id) => { createdProductId = id; },
    afterCreate: async () => { calls.push('MEDIA'); },
    saveFiscal: async () => { calls.push('PUT'); if (calls.filter((call) => call === 'PUT').length === 1) throw new Error('falha fiscal'); },
  };
  const first = await recovery.submitProductWithFiscalRecovery({ ...options, createdProductId });
  assert.equal(first.status, 'fiscal-recovery');
  const second = await recovery.submitProductWithFiscalRecovery({ ...options, createdProductId });
  assert.equal(second.status, 'complete');
  assert.deepEqual(calls, ['POST', 'MEDIA', 'PUT', 'PUT']);
});

function mediaFailureScenario(putOutcomes = []) {
  let createdProductId = null;
  const calls = [];
  const puts = [];
  const submit = (fiscalValues, { saveFiscal = true, mediaPending = false } = {}) =>
    recovery.submitProductWithFiscalRecovery({
      createdProductId,
      fiscalValues,
      mediaPending,
      createProduct: async () => { calls.push('POST'); return 'product-123'; },
      onCreated: (id) => { createdProductId = id; },
      afterCreate: async () => { calls.push('MEDIA'); throw new Error('falha no vídeo'); },
      saveFiscal: saveFiscal ? async (id, values) => {
        calls.push('PUT');
        puts.push({ id, values: { ...values } });
        const outcome = putOutcomes.shift();
        if (outcome) throw outcome;
      } : null,
    });
  return { submit, calls, puts, get createdProductId() { return createdProductId; } };
}

test('media failure without fiscal data offers opening the existing product and never sends PUT or second POST', async () => {
  const flow = mediaFailureScenario();
  const first = await flow.submit({}, { saveFiscal: false });
  assert.equal(first.status, 'media-error');
  assert.equal(first.productId, 'product-123');
  assert.equal(recovery.postCreationAction({ mediaError: true, fiscalError: false, hasFiscalCurrent: false }), 'open-product');
  assert.deepEqual(flow.calls, ['POST', 'MEDIA']);
  assert.equal(flow.createdProductId, 'product-123');
});

test('media failure with fiscal data waits for a deliberate PUT, then opens edit without retrying media', async () => {
  const flow = mediaFailureScenario();
  const first = await flow.submit({ ncm: '33059000' });
  assert.equal(first.status, 'media-error');
  assert.deepEqual(flow.calls, ['POST', 'MEDIA']);
  assert.equal(recovery.postCreationAction({ mediaError: true, fiscalError: false, hasFiscalCurrent: true }), 'save-fiscal-and-open');
  const second = await flow.submit({ ncm: '33059000' }, { mediaPending: true });
  assert.equal(second.status, 'complete');
  assert.equal(second.mediaPending, true);
  assert.deepEqual(flow.calls, ['POST', 'MEDIA', 'PUT']);
  assert.deepEqual(flow.puts, [{ id: 'product-123', values: { ncm: '33059000' } }]);
});

test('media and fiscal errors coexist across retries until fiscal succeeds', async () => {
  const flow = mediaFailureScenario([new Error('NCM inválido'), new Error('NCM inválido')]);
  assert.equal((await flow.submit({ ncm: '1' })).status, 'media-error');
  const failed = await flow.submit({ ncm: '1' }, { mediaPending: true });
  assert.equal(failed.status, 'fiscal-recovery');
  assert.equal(failed.mediaPending, true);
  assert.equal(recovery.postCreationAction({ mediaError: true, fiscalError: true, hasFiscalCurrent: true }), 'retry-fiscal');
  const failedAgain = await flow.submit({ ncm: '2' }, { mediaPending: true });
  assert.equal(failedAgain.status, 'fiscal-recovery');
  assert.equal(failedAgain.mediaPending, true);
  const complete = await flow.submit({ ncm: '33059000' }, { mediaPending: true });
  assert.equal(complete.status, 'complete');
  assert.equal(complete.mediaPending, true);
  assert.deepEqual(flow.calls, ['POST', 'MEDIA', 'PUT', 'PUT', 'PUT']);
  assert.equal(flow.puts[2].values.ncm, '33059000');
});

test('fiscal added after media failure uses current values; an empty draft never requests PUT', async () => {
  const flow = mediaFailureScenario();
  await flow.submit({}, { saveFiscal: false });
  assert.equal(recovery.postCreationAction({ mediaError: true, fiscalError: false, hasFiscalCurrent: false }), 'open-product');
  assert.deepEqual(flow.calls, ['POST', 'MEDIA']);
  assert.equal(recovery.postCreationAction({ mediaError: true, fiscalError: false, hasFiscalCurrent: true }), 'save-fiscal-and-open');
  await flow.submit({ ncm: '33059000' }, { mediaPending: true });
  assert.deepEqual(flow.calls, ['POST', 'MEDIA', 'PUT']);
  assert.equal(flow.puts[0].values.ncm, '33059000');
});

test('normal fiscal recovery remains separate from media error', async () => {
  assert.equal(recovery.postCreationAction({ mediaError: false, fiscalError: true, hasFiscalCurrent: true }), 'retry-fiscal');
  assert.equal(recovery.postCreationAction({ mediaError: false, fiscalError: false, hasFiscalCurrent: false }), 'open-product');
  const flow = scenario([new Error('falha fiscal')]);
  assert.equal((await flow.submit({ ncm: '1' })).status, 'fiscal-recovery');
  const complete = await flow.submit({ ncm: '2' });
  assert.equal(complete.status, 'complete');
  assert.deepEqual(flow.calls, ['POST', 'PUT', 'PUT']);
});
