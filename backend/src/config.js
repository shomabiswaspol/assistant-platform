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
  fazleReaderUrl: process.env.FAZLE_AI_READER_DB_URL || '',
  smtpHost: process.env.SMTP_HOST || '',
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
