import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockIdentityProvider, AwaitingProviderContract } from '../apps/api/src/identity-provider.ts';
import { envelope } from '../apps/api/src/common.ts';
import { Attestation } from '../packages/domain/src/index.ts';
import { disabledProviders } from '../packages/domain/src/providers.ts';

const keys = generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const publicKey = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const input = { subject: 'TEST-PERSON-0002', challenge: 'test-challenge-for-contract-verification' };
const client = () => new MockIdentityProvider({ environment: 'test', provider: 'A', authorization: 'test-provider-service-authorization', publicKey });
const assertion = () => {
  const now = Date.now();
  return Attestation.parse({ ...input, provider: 'A', attributes: { verifiedOwner: true, age: 25, citizenship: 'UA' },
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 120000).toISOString() });
};
afterEach(() => { vi.restoreAllMocks(); });

describe('identity provider contract boundary', () => {
  it('verifies the configured mock signature and binds every response to its request', async () => {
    const value = assertion();
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(envelope(value, privateKey))));
    expect(await client().authenticate(input)).toEqual(value);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4312/attest');
  });
  it('rejects expired, future, excessive-lifetime and mismatched signed assertions', async () => {
    const valid = assertion();
    const mutations = [
      { expiresAt: new Date(Date.now() - 1).toISOString() },
      { issuedAt: new Date(Date.now() + 10000).toISOString() },
      { issuedAt: new Date(Date.now() - 125000).toISOString() },
      { expiresAt: new Date(Date.now() + 3600000).toISOString() },
      { provider: 'B' }, { subject: 'TEST-PERSON-0003' }, { challenge: 'different-request-challenge' },
    ];
    const transport = vi.spyOn(globalThis, 'fetch');
    for (const change of mutations) {
      transport.mockResolvedValueOnce(new Response(JSON.stringify(envelope({ ...valid, ...change }, privateKey))));
      await expect(client().authenticate(input)).rejects.toThrow('ATTESTATION_REJECTED');
    }
    expect(transport).toHaveBeenCalledTimes(mutations.length);
  });
  it('rejects a signature from an unauthorized issuer without treating it as an outage', async () => {
    const unauthorized = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(envelope(assertion(), unauthorized))));
    await expect(client().authenticate(input)).rejects.toMatchObject({ message: 'INVALID_SIGNATURE', statusCode: 422 });
  });
  it('makes exactly one transport attempt and exposes an unavailable provider', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'PROVIDER_UNAVAILABLE' }), { status: 503 }));
    await expect(client().authenticate(input)).rejects.toMatchObject({ message: 'PROVIDER_UNAVAILABLE', statusCode: 503 });
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockRejectedValueOnce(new TypeError('Test transport interruption'));
    expect(await client().status()).toMatchObject({ provider: 'A', available: false, observation: 'TransportUnavailable' });
  });
  it('does not invent availability from malformed or mismatched status data', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ provider: 'B', available: true, testOnly: true, upstream: 'independent-local-mock-B' })));
    await expect(client().status()).rejects.toThrow('PROVIDER_STATUS_MISMATCH');
    transport.mockResolvedValueOnce(new Response(JSON.stringify({ available: true })));
    await expect(client().status()).rejects.toThrow();
  });
  it('rejects real identifiers and production configuration before contacting a provider', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    await expect(client().authenticate({ ...input, subject: 'NOT-A-TEST-SUBJECT' })).rejects.toThrow();
    expect(() => new MockIdentityProvider({ environment: 'production', provider: 'A', authorization: 'test-only', publicKey })).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('keeps all three production boundaries explicitly disabled without any network call', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    for (const descriptor of disabledProviders) {
      const adapter = new AwaitingProviderContract(descriptor.provider);
      expect(await adapter.status()).toMatchObject({ available: false, testOnly: false, state: 'AwaitingProviderContract' });
      await expect(adapter.authenticate({})).rejects.toMatchObject({ message: 'AWAITING_PROVIDER_CONTRACT', statusCode: 503 });
    }
    expect(transport).not.toHaveBeenCalled();
  });
});
