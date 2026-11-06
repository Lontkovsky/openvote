import { z } from 'zod';
import { testPersons } from '../../../packages/domain/src/fixtures.ts';
import { Attestation } from '../../../packages/domain/src/index.ts';
import { application, authorize, envelope, Failure, required } from './common.ts';
import type { ConfigType } from './common.ts';

export async function providerApp(config: ConfigType, publicOrigin: string) {
  const provider = z.enum(['A', 'B']).parse(config.role.slice(-1));
  const app = await application(config, publicOrigin);
  const State = z.strictObject({ available: z.boolean(), delayMs: z.number().int().min(0).max(3000), conflictingAttributes: z.boolean() });
  let state = State.parse({ available: true, delayMs: 0, conflictingAttributes: false });
  let pending = 0;
  app.get('/status', () => ({ provider, available: state.available, testOnly: true, upstream: 'independent-local-mock-' + provider }));
  app.get('/control', async request => { authorize(request.headers.authorization, config.serviceToken); return { ...state, pending }; });
  app.post('/control', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    state = State.parse(request.body);
    return { provider, ...state };
  });
  app.post('/attest', async request => {
    authorize(request.headers.authorization, config.serviceToken);
    const input = z.strictObject({ subject: z.string().regex(/^TEST-PERSON-\d{4}$/), challenge: z.string().min(32) }).parse(request.body);
    if (!state.available) throw new Failure('PROVIDER_UNAVAILABLE', 503);
    pending++;
    try { if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs)); }
    finally { pending--; }
    const person = testPersons.find(p => p.subject === input.subject);
    if (!person) throw new Failure('UNKNOWN_TEST_PERSON', 400);
    const attributes = state.conflictingAttributes ? { ...person.attributes, citizenship: 'DE' } : person.attributes;
    const issuedAt = Date.now();
    const attestation = Attestation.parse({ provider, subject: input.subject, challenge: input.challenge, attributes,
      issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(issuedAt + 120000).toISOString() });
    return envelope(attestation, required(config.signingKey));
  });
  return app;
}
