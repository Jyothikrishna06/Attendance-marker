import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('*'),
  JWT_ACCESS_SECRET: z.string().default('curfew_system_super_secret_access_jwt_key_2026_dev_mode_only'),
  JWT_REFRESH_SECRET: z.string().default('curfew_system_super_secret_refresh_jwt_key_2026_dev_mode_only'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  DATABASE_URL: z.string().optional().default('postgresql://postgres:postgres@localhost:5432/hostel_curfew'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(5), // 5 failed attempts per window
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:', result.error.format());
    throw new Error('Environment variable validation failure');
  }
  return result.data;
}

export const env = loadEnv();
