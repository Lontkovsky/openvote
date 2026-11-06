import { z } from 'zod';
import { Attestation, Environment } from '../../../packages/domain/src/index.ts';
import { MockIdentityRequest, MockProviderStatus, MockProviderId, disabledProviders, mockCapabilities } from '../../../packages/domain/src/providers.ts';
import type { ProviderStatusType } from '../../../packages/domain/src/providers.ts';
import { Failure, openEnvelope, required } from './common.ts';

// This is an application boundary, not a claim about any production wire protocol.
// Request/Assertion types belong to the concrete provider's established contract.
export interface IdentityProvider<Request, Assertion> {
  status(): Promise<ProviderStatusType>;
  authenticate(request: Request): Promise<Assertion>;
}

export class MockIdentityProvider implements IdentityProvider<z.infer<typeof MockIdentityRequest>, z.infer<typeof Attestation>> {
  private readonly id: z.infer<typeof MockProviderId>;
  private readonly origin: string;
  private readonly authorization: string;
  private readonly publicKey: string;
  constructor(input: { environment: unknown; provider: unknown; authorization: string; publicKey: string }) {
    Environment.parse(input.environment);
    this.id = MockProviderId.parse(input.provider);
    this.origin = this.id === 'A' ? 'http://127.0.0.1:4312' : 'http://127.0.0.1:4313';
    this.authorization = input.authorization;
    this.publicKey = input.publicKey;
  }
  async status() {
    let response: Response;
    const base = { provider: this.id, name: 'Mock ' + this.id, testOnly: true, upstream: 'independent-local-mock-' + this.id,
      state: 'TestImplemented', capabilities: mockCapabilities };
    try { response = await fetch(this.origin + '/status', { signal: AbortSignal.timeout(2000), redirect: 'error' }); }
    catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) return MockProviderStatus.parse({ ...base, available: false, observation: 'TransportUnavailable' });
      throw error;
    }
    if (!response.ok) throw new Failure('PROVIDER_STATUS_REJECTED', 502);
    const status = z.strictObject({ provider: MockProviderId, available: z.boolean(), testOnly: z.literal(true), upstream: z.string() }).parse(await response.json());
    if (status.provider !== this.id || status.upstream !== base.upstream) throw new Failure('PROVIDER_STATUS_MISMATCH', 502);
    return MockProviderStatus.parse({ ...base, available: status.available, observation: 'ProviderReported' });
  }
  async authenticate(request: z.infer<typeof MockIdentityRequest>) {
    const input = MockIdentityRequest.parse(request);
    let response: Response;
    try { response = await fetch(this.origin + '/attest', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.authorization },
      body: JSON.stringify(input), signal: AbortSignal.timeout(5000), redirect: 'error' }); }
    catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) throw new Failure('PROVIDER_UNAVAILABLE', 503);
      throw error;
    }
    if (!response.ok) {
      const failure = z.strictObject({ error: z.string().regex(/^[A-Z_]+$/) }).parse(await response.json());
      throw new Failure(failure.error, response.status);
    }
    const attestation = Attestation.parse(openEnvelope(await response.json(), this.publicKey));
    if (attestation.provider !== this.id || attestation.subject !== input.subject || attestation.challenge !== input.challenge
      || Date.parse(attestation.expiresAt) <= Date.now() || Date.parse(attestation.issuedAt) > Date.now() + 5000
      || Date.now() - Date.parse(attestation.issuedAt) > 120000 || Date.parse(attestation.expiresAt) <= Date.parse(attestation.issuedAt)
      || Date.parse(attestation.expiresAt) - Date.parse(attestation.issuedAt) > 120000) throw new Failure('ATTESTATION_REJECTED', 422);
    return attestation;
  }
}

export class AwaitingProviderContract implements IdentityProvider<unknown, never> {
  private readonly descriptor;
  constructor(provider: 'diia-signature' | 'bankid-nbu' | 'qes') { this.descriptor = required(disabledProviders.find(p => p.provider === provider)); }
  async status() { return this.descriptor; }
  async authenticate(_request: unknown): Promise<never> { throw new Failure('AWAITING_PROVIDER_CONTRACT', 503); }
}
