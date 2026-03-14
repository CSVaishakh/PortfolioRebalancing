import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

if (!process.env["DATABASE_URL"]) {
    throw new Error("DATABASE_URL environment variable is not set");
}

export const db = drizzle(process.env["DATABASE_URL"], { schema });

export * from "./schema.js";
