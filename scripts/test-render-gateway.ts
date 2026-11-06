import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { renderNginxConfiguration } from './render-start.ts';

const gatewayPort = 10000;
const upstreams = [
  { role: 'identity', port: 4301 },
  { role: 'ballot', port: 4302 },
  { role: 'management', port: 4303 },
] as const;

const servers = upstreams.map(upstream => createServer((incoming, response) => {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ role: upstream.role, path: incoming.url }));
}));

await Promise.all(servers.map((server, index) => new Promise<void>((resolvePromise, rejectPromise) => {
  const upstream = upstreams[index];
  if (upstream === undefined) return rejectPromise(new Error('GATEWAY_FIXTURE_INVALID'));
  server.once('error', rejectPromise);
  server.listen(upstream.port, '127.0.0.1', resolvePromise);
})));

function gateway(host: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const outgoing = request({ hostname: '127.0.0.1', port: gatewayPort, path, headers: { host } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolvePromise({ status: response.statusCode ?? 0, body }));
    });
    outgoing.once('error', rejectPromise);
    outgoing.end();
  });
}

const config = await renderNginxConfiguration(gatewayPort, '/tmp/openvote-gateway-test.conf');
const nginxTest = spawn('/usr/sbin/nginx', ['-t', '-c', config], { stdio: 'inherit' });
await new Promise<void>((resolvePromise, rejectPromise) => {
  nginxTest.once('error', rejectPromise);
  nginxTest.once('exit', code => code === 0 ? resolvePromise() : rejectPromise(new Error('NGINX_CONFIGURATION_REJECTED')));
});

const nginx = spawn('/usr/sbin/nginx', ['-c', config, '-g', 'daemon off;'], { stdio: 'inherit' });
try {
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
    try { ready = (await gateway('render-health', '/health')).status === 200; }
    catch { await delay(100); }
  }
  if (!ready) throw new Error('GATEWAY_READINESS_FAILED');

  const page = await gateway('openvote.com.ua', '/');
  if (page.status !== 200 || !page.body.includes('OpenVote')) throw new Error('GATEWAY_SPA_FAILED');
  for (const upstream of upstreams) {
    const response = await gateway(`${upstream.role}.openvote.com.ua`, '/v1/test-check');
    const body: unknown = JSON.parse(response.body);
    if (response.status !== 200 || typeof body !== 'object' || body === null ||
        Reflect.get(body, 'role') !== upstream.role || Reflect.get(body, 'path') !== '/v1/test-check') {
      throw new Error('GATEWAY_API_ROUTING_FAILED');
    }
  }
  if ((await gateway('unknown.openvote.com.ua', '/')).status !== 421) throw new Error('GATEWAY_UNKNOWN_HOST_ACCEPTED');
  if ((await gateway('openvote.com.ua', '/.runtime/bootstrap.json')).status !== 404) throw new Error('GATEWAY_RUNTIME_EXPOSED');
  console.log('Render gateway host routing: PASS');
} finally {
  nginx.kill('SIGTERM');
  await new Promise<void>(resolvePromise => nginx.once('exit', () => resolvePromise()));
  await Promise.all(servers.map(server => new Promise<void>((resolvePromise, rejectPromise) => {
    server.close(error => error === undefined ? resolvePromise() : rejectPromise(error));
  })));
}
