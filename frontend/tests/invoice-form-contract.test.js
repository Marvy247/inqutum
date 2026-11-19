const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCreateInvoiceInput,
  classifyInvoiceSubmitError,
} = require('../lib/invoice-form-contract');

const validWallet = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const validForm = {
  amount: '50.75',
  assetCode: 'xlm',
  expiresInDays: 7,
  sellerName: '  Alice Store  ',
  sellerEmail: '  alice@store.com  ',
  customerName: '  Bob Client  ',
  customerEmail: '  bob@client.com  ',
  description: '  Consulting services  ',
};

test('requires a connected user wallet', () => {
  for (const wallet of ['', '   ', null, undefined]) {
    const res = validateCreateInvoiceInput(validForm, wallet);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'WALLET_REQUIRED');
      assert.equal(res.walletError, 'Connect your wallet first');
    }
  }
});

test('valid form values produce sanitized payload', () => {
  const res = validateCreateInvoiceInput(validForm, validWallet);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.payload.amount, 50.75);
    assert.equal(res.payload.assetCode, 'XLM');
    assert.equal(res.payload.expiresInDays, 7);
    assert.equal(res.payload.sellerPublicKey, validWallet);
    assert.equal(res.payload.sellerName, 'Alice Store');
    assert.equal(res.payload.sellerEmail, 'alice@store.com');
    assert.equal(res.payload.customerName, 'Bob Client');
    assert.equal(res.payload.customerEmail, 'bob@client.com');
    assert.equal(res.payload.description, 'Consulting services');
  }
});

test('rejects missing, zero, negative and non-numeric amounts', () => {
  for (const amount of ['', '0', '-10', 'abc', '  ']) {
    const res = validateCreateInvoiceInput({ ...validForm, amount }, validWallet);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.errors.amount);
      assert.equal(res.firstInvalid, 'amount');
    }
  }
});

test('rejects invalid email formats for seller and customer', () => {
  const res = validateCreateInvoiceInput(
    { ...validForm, sellerEmail: 'not-an-email', customerEmail: 'bad-email@' },
    validWallet
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(res.errors.sellerEmail);
    assert.ok(res.errors.customerEmail);
  }
});

test('permits omitted optional email and text fields', () => {
  const res = validateCreateInvoiceInput(
    {
      amount: '10',
      sellerName: '',
      sellerEmail: '',
      customerName: '',
      customerEmail: '',
      description: '',
    },
    validWallet
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.payload.sellerName, undefined);
    assert.equal(res.payload.sellerEmail, undefined);
    assert.equal(res.payload.customerName, undefined);
    assert.equal(res.payload.customerEmail, undefined);
    assert.equal(res.payload.description, undefined);
  }
});

test('rejects out-of-range or non-integer expiresInDays', () => {
  for (const days of [0, -1, 31, 100, 1.5, 'invalid']) {
    const res = validateCreateInvoiceInput(
      { ...validForm, expiresInDays: days },
      validWallet
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.errors.expiresInDays);
    }
  }
});

test('rejects description exceeding 500 characters', () => {
  const longDesc = 'a'.repeat(501);
  const res = validateCreateInvoiceInput(
    { ...validForm, description: longDesc },
    validWallet
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(res.errors.description);
  }
});

test('defaults assetCode to XLM and days to 7 when omitted', () => {
  const res = validateCreateInvoiceInput(
    { amount: '10', assetCode: '', expiresInDays: undefined },
    validWallet
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.payload.assetCode, 'XLM');
    assert.equal(res.payload.expiresInDays, 7);
  }
});

// Issue #161: InvoiceForm degraded-dependency and retry contract.
test('Issue #161: classifies an unreachable API as a degraded, retryable failure', () => {
  const error = Object.assign(new Error('Quittance API is unreachable.'), {
    name: 'ApiUnavailableError',
    code: 'API_UNREACHABLE',
  });
  const classified = classifyInvoiceSubmitError(error);

  assert.equal(classified.degraded, true);
  assert.equal(classified.retryable, true);
  assert.equal(classified.code, 'API_UNREACHABLE');
  assert.equal(classified.message, 'Quittance API is unreachable.');
});

test('Issue #161: keeps server-flagged retryable request errors retryable without marking them degraded', () => {
  const error = Object.assign(new Error('Rate limited'), {
    code: 'RATE_LIMITED',
    retryable: true,
  });
  const classified = classifyInvoiceSubmitError(error);

  assert.equal(classified.degraded, false);
  assert.equal(classified.retryable, true);
  assert.equal(classified.code, 'RATE_LIMITED');
});

test('Issue #161: does not advertise a retry for non-retryable validation failures', () => {
  const error = Object.assign(new Error('Invoice validation failed'), {
    code: 'VALIDATION_FAILED',
    retryable: false,
  });
  const classified = classifyInvoiceSubmitError(error);

  assert.equal(classified.degraded, false);
  assert.equal(classified.retryable, false);
  assert.equal(classified.code, 'VALIDATION_FAILED');
});

test('Issue #161: falls back to a stable code and message for unknown failures', () => {
  for (const error of [undefined, null, {}, 'boom']) {
    const classified = classifyInvoiceSubmitError(error, 'Failed to create invoice');
    assert.equal(classified.code, 'API_REQUEST_FAILED');
    assert.equal(classified.degraded, false);
    assert.equal(classified.retryable, false);
    assert.equal(classified.message, 'Failed to create invoice');
  }
});
