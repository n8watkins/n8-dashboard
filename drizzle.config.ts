import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit loads .env by default; this project keeps secrets in .env.local.
config({ path: '.env.local' })

export default defineConfig({
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'turso', // @libsql/client — handles both file: (local) and libsql:// (cloud)
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || 'file:local.db',
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
})
