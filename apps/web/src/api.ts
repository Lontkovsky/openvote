import { demoRequest } from './demo-api.ts';
import { publicDemoMode } from './demo-mode.ts';

export const endpoints = {
  identity: import.meta.env.VITE_IDENTITY_ORIGIN,
  ballot: import.meta.env.VITE_BALLOT_ORIGIN,
  management: import.meta.env.VITE_MANAGEMENT_ORIGIN,
};
export class ApiFailure extends Error {
  status: number;
  constructor(code: string, status: number) { super(code); this.status = status; }
}
export async function request(area: keyof typeof endpoints, path: string, method = 'GET', body?: unknown, token?: string): Promise<unknown> {
  if (publicDemoMode) return demoRequest(area, path, method, body, token);
  if (area === 'ballot' && token !== undefined) throw new Error('Сесія особи не передається до сервісу бюлетенів.');
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token !== undefined) headers.authorization = 'Bearer ' + token;
  const response = await fetch(endpoints[area] + path, { method, headers, credentials: 'omit', referrerPolicy: 'no-referrer',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(100000) });
  if (!response.ok) {
    const result: unknown = await response.json();
    const code = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string' ? result.error : `HTTP_${response.status}`;
    throw new ApiFailure(code, response.status);
  }
  return response.json();
}
