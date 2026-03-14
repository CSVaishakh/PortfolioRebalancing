import { db, users } from "database";
import { eq } from "drizzle-orm";

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function createUser(username: string, email: string, hashedPassword: string) {
  const [user] = await db
    .insert(users)
    .values({ username, email, password: hashedPassword })
    .returning({ userid: users.userid, username: users.username, email: users.email });
  return user!;
}
