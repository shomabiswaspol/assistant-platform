export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  db: {
    host: process.env.DB_HOST || 'assistant-db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'assistant',
    user: process.env.DB_USER || 'assistant',
    password: process.env.DB_PASSWORD || '',
  },
  redisUrl: process.env.REDIS_URL || 'redis://assistant-redis:6379',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  omnirouteUrl: process.env.OMNIROUTE_URL || 'http://omniroute:20128/v1',
  omnirouteApiKey: process.env.OMNIROUTE_API_KEY || '',
  // opencode serve runs on the HOST (systemd user service, not Docker) —
  // this container reaches it via host.docker.internal, same mechanism
  // already used for fazle-core's Postgres (extra_hosts in docker-compose.yml).
  opencodeUrl: process.env.OPENCODE_URL || 'http://host.docker.internal:8091',
  // hermes-runner.service (host-level, invokes the real `hermes` CLI with
  // real terminal/file/code_execution access) — same nginx-proxy pattern
  // as opencodeUrl, and for the same reason (a direct bridge-gateway route
  // from this container to a 127.0.0.1-bound host service was found to be
  // silently dropped by the kernel on this VPS).
  hermesRunnerUrl: process.env.HERMES_RUNNER_URL || 'http://172.25.0.1:80/hermes-internal',
  hermesRunnerSecret: process.env.HERMES_RUNNER_SECRET || '',
  fazleDb: {
    enabled: process.env.FAZLE_DB_ENABLED === 'true',
    host: process.env.FAZLE_DB_HOST || 'host.docker.internal',
    port: parseInt(process.env.FAZLE_DB_PORT || '5432', 10),
    name: process.env.FAZLE_DB_NAME || 'postgres',
    user: process.env.FAZLE_DB_USER || 'fazle_ai_reader',
    password: process.env.FAZLE_DB_PASSWORD || '',
    maxPool: parseInt(process.env.FAZLE_DB_MAX_POOL || '3', 10),
    statementTimeoutMs: parseInt(process.env.FAZLE_DB_STATEMENT_TIMEOUT || '5000', 10),
  },
  appBaseUrl: process.env.APP_BASE_URL || 'https://assistant.iamazim.com',
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || 'onboarding@resend.dev',
  admin: {
    email: process.env.ADMIN_EMAIL || '',
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
  },
};

for (const required of ['jwtSecret', 'jwtRefreshSecret', 'encryptionKey']) {
  if (!config[required]) {
    // eslint-disable-next-line no-console
    console.error(`FATAL: missing required env for config.${required}`);
    process.exit(1);
  }
}
