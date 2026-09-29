import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

export const DEV_DEFAULT_ACCESS_SECRET = 'curfew_system_super_secret_access_jwt_key_2026_dev_mode_only';
export const DEV_DEFAULT_REFRESH_SECRET = 'curfew_system_super_secret_refresh_jwt_key_2026_dev_mode_only';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('*'),
  JWT_ACCESS_SECRET: z.string().default(DEV_DEFAULT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().default(DEV_DEFAULT_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  DATABASE_URL: z.string().optional().default('postgresql://postgres:postgres@localhost:5432/hostel_curfew'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(5), // 5 failed attempts per window
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (data.JWT_ACCESS_SECRET === DEV_DEFAULT_ACCESS_SECRET || data.JWT_ACCESS_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET must be explicitly configured and at least 32 characters long in production mode',
        path: ['JWT_ACCESS_SECRET'],
      });
    }
    if (data.JWT_REFRESH_SECRET === DEV_DEFAULT_REFRESH_SECRET || data.JWT_REFRESH_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_REFRESH_SECRET must be explicitly configured and at least 32 characters long in production mode',
        path: ['JWT_REFRESH_SECRET'],
      });
    }
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct secrets',
        path: ['JWT_REFRESH_SECRET'],
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, unknown> = process.env): EnvConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    console.error('Invalid environment configuration:', result.error.format());
    throw new Error('Environment variable validation failure');
  }
  return result.data;
}

export const env = parseEnv();

