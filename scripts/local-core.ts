import { spawn } from 'node:child_process';

// Test test/operator IPC, isolated from network and other operator files.
export async function localCore(input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['run', '--rm', '-i', '--network', 'none', '--platform', 'linux/amd64',
      '--read-only', '--tmpfs', '/tmp:size=256m,mode=1777', '--memory', '512m', '--cpus', '2',
      '-v', process.cwd() + '/tools:/tools:ro', '--entrypoint', 'python3', 'openvote-crypto:3.3.0', '/tools/reference.py'], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.on('error', () => reject(new Error('LOCAL_REFERENCE_UNAVAILABLE')));
    child.on('exit', code => {
      if (code !== 0) reject(new Error('LOCAL_REFERENCE_REJECTED'));
      else { try { resolve(JSON.parse(output)); } catch { reject(new Error('INVALID_REFERENCE_RESPONSE')); } }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
