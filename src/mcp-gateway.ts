/**
 * MCP Gateway Manager
 * Manages supergateway child processes for stdio-type MCP servers
 * and health-checks http-type MCP servers.
 */
import { ChildProcess, execSync, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';

import { MCP_GATEWAY_CONFIG_PATH } from './config.js';
import { logger } from './logger.js';

interface McpGatewayEntry {
  name: string;
  type: 'stdio' | 'http';
  // For stdio: supergateway wraps this command
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  port?: number;
  // For http: direct URL to existing HTTP MCP server
  url?: string;
  optional?: boolean;
  description?: string;
}

interface McpGatewayConfig {
  gateways: McpGatewayEntry[];
}

interface ManagedGateway {
  entry: McpGatewayEntry;
  process?: ChildProcess;
  healthy: boolean;
  restartCount: number;
  restartTimer?: ReturnType<typeof setTimeout>;
}

const MAX_RESTART_DELAY = 60_000;
const HEALTH_CHECK_INTERVAL = 30_000;
const STARTUP_HEALTH_TIMEOUT = 10_000;

const managedGateways: Map<string, ManagedGateway> = new Map();
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

function loadConfig(): McpGatewayConfig | null {
  if (!fs.existsSync(MCP_GATEWAY_CONFIG_PATH)) {
    logger.info('No MCP gateway config found, skipping');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(MCP_GATEWAY_CONFIG_PATH, 'utf-8'));
  } catch (err) {
    logger.error({ err, path: MCP_GATEWAY_CONFIG_PATH }, 'Failed to parse MCP gateway config');
    return null;
  }
}

function getGatewayUrl(entry: McpGatewayEntry): string {
  if (entry.type === 'http') {
    return entry.url!;
  }
  return `http://127.0.0.1:${entry.port}/sse`;
}

function healthCheck(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const req = http.get(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        timeout: 5000,
      },
      (res) => {
        // Any response (even 405) means the server is listening
        res.resume();
        resolve(true);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function resolveCommand(cmd: string): string {
  // Resolve commands to full paths for launchctl environments where PATH is minimal
  try {
    return execSync(`which ${cmd}`, { encoding: 'utf-8' }).trim();
  } catch {
    // Fallback: check common Node.js install locations directly
    const candidates = [
      `/usr/local/bin/${cmd}`,
      `/usr/local/opt/node@22/bin/${cmd}`,
      `/opt/homebrew/bin/${cmd}`,
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return cmd;
  }
}

function spawnSupergateway(entry: McpGatewayEntry): ChildProcess {
  const stdioCmdParts = [entry.command!, ...(entry.args || [])];
  // Resolve the inner command to a full path too
  stdioCmdParts[0] = resolveCommand(stdioCmdParts[0]);
  const stdioCmd = stdioCmdParts.join(' ');

  const supergatewayPath = resolveCommand('supergateway');
  const args = [
    '--stdio', stdioCmd,
    '--port', String(entry.port),
  ];

  const env: Record<string, string | undefined> = { ...process.env };
  // Ensure PATH includes common Node.js install locations — supergateway
  // spawns the stdio command via a shell that inherits this PATH
  const extraPaths = ['/usr/local/bin', '/usr/local/opt/node@22/bin', '/opt/homebrew/bin'];
  const currentPath = env.PATH || '/usr/bin:/bin';
  env.PATH = [...extraPaths, ...currentPath.split(':')].filter((v, i, a) => a.indexOf(v) === i).join(':');
  if (entry.env) {
    Object.assign(env, entry.env);
  }

  logger.info({ name: entry.name, port: entry.port, command: supergatewayPath, stdioCmd }, 'Spawning supergateway');

  const proc = spawn(supergatewayPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  proc.stdout?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) logger.debug({ gateway: entry.name }, line);
  });

  proc.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) logger.debug({ gateway: entry.name }, line);
  });

  return proc;
}

function getRestartDelay(restartCount: number): number {
  return Math.min(1000 * Math.pow(2, restartCount), MAX_RESTART_DELAY);
}

function startGatewayProcess(managed: ManagedGateway): void {
  const entry = managed.entry;
  if (entry.type !== 'stdio') return;

  const proc = spawnSupergateway(entry);
  managed.process = proc;

  proc.on('close', (code) => {
    logger.warn({ gateway: entry.name, code }, 'Supergateway process exited');
    managed.healthy = false;
    managed.process = undefined;

    // Auto-restart with exponential backoff
    const delay = getRestartDelay(managed.restartCount);
    managed.restartCount++;
    logger.info({ gateway: entry.name, delay, restartCount: managed.restartCount }, 'Scheduling gateway restart');
    managed.restartTimer = setTimeout(() => startGatewayProcess(managed), delay);
  });

  proc.on('error', (err) => {
    logger.error({ gateway: entry.name, err }, 'Supergateway spawn error');
    managed.healthy = false;
  });
}

async function checkAllHealth(): Promise<void> {
  for (const [name, managed] of managedGateways) {
    const url = getGatewayUrl(managed.entry);
    const wasHealthy = managed.healthy;
    managed.healthy = await healthCheck(url);

    if (managed.healthy && !wasHealthy) {
      managed.restartCount = 0;
      logger.info({ gateway: name }, 'MCP gateway became healthy');
    } else if (!managed.healthy && wasHealthy) {
      if (managed.entry.optional) {
        logger.warn({ gateway: name }, 'Optional MCP gateway became unhealthy');
      } else {
        logger.error({ gateway: name }, 'MCP gateway became unhealthy');
      }
    }
  }
}

export async function startMcpGateways(): Promise<void> {
  const config = loadConfig();
  if (!config || config.gateways.length === 0) return;

  for (const entry of config.gateways) {
    const managed: ManagedGateway = {
      entry,
      healthy: false,
      restartCount: 0,
    };
    managedGateways.set(entry.name, managed);

    if (entry.type === 'stdio') {
      if (!entry.command || !entry.port) {
        logger.error({ gateway: entry.name }, 'stdio gateway missing command or port, skipping');
        continue;
      }
      startGatewayProcess(managed);
    }
  }

  // Wait a moment for processes to start, then do initial health check
  await new Promise((r) => setTimeout(r, STARTUP_HEALTH_TIMEOUT));
  await checkAllHealth();

  for (const [name, managed] of managedGateways) {
    if (managed.healthy) {
      logger.info({ gateway: name, url: getGatewayUrl(managed.entry) }, 'MCP gateway started');
    } else if (managed.entry.optional) {
      logger.warn({ gateway: name }, 'Optional MCP gateway not available');
    } else {
      logger.error({ gateway: name }, 'Required MCP gateway failed to start');
    }
  }

  // Periodic health checks
  healthCheckTimer = setInterval(() => checkAllHealth(), HEALTH_CHECK_INTERVAL);
}

export async function stopMcpGateways(): Promise<void> {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  for (const [name, managed] of managedGateways) {
    if (managed.restartTimer) clearTimeout(managed.restartTimer);
    if (managed.process) {
      logger.info({ gateway: name }, 'Stopping MCP gateway');
      managed.process.kill('SIGTERM');
    }
  }

  managedGateways.clear();
}

/**
 * Returns gateways that are currently healthy.
 * Each entry includes the name and the URL that containers should connect to
 * (rewritten to use host.docker.internal instead of 127.0.0.1).
 */
export function getAvailableGateways(): Array<{ name: string; url: string }> {
  const results: Array<{ name: string; url: string }> = [];

  for (const [name, managed] of managedGateways) {
    if (!managed.healthy) continue;

    // Rewrite 127.0.0.1 to host.docker.internal for container access
    const hostUrl = getGatewayUrl(managed.entry).replace(
      '127.0.0.1',
      'host.docker.internal',
    );
    results.push({ name, url: hostUrl });
  }

  return results;
}
