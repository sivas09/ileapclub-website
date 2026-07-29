import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  CLIENT_ORIGINS: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(4000)
}).transform((env) => ({
  ...env,
  CLIENT_ORIGINS: (env.CLIENT_ORIGINS || env.CLIENT_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}));

export const config = envSchema.parse(process.env);
