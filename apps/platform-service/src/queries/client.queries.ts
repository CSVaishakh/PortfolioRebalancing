import { db, users, userModelHistory, globalModelHistory } from "database";
import { eq, desc } from "drizzle-orm";

export async function getUserById(userId: number) {
  const [user] = await db
    .select({ userid: users.userid, username: users.username, email: users.email })
    .from(users)
    .where(eq(users.userid, userId))
    .limit(1);
  return user ?? null;
}

export async function getLatestGlobalModel() {
  const [row] = await db
    .select()
    .from(globalModelHistory)
    .orderBy(desc(globalModelHistory.timestamp))
    .limit(1);
  return row ?? null;
}

export async function getLatestUserWeights(userId: number) {
  const [row] = await db
    .select()
    .from(userModelHistory)
    .where(eq(userModelHistory.userid, userId))
    .orderBy(desc(userModelHistory.timestamp))
    .limit(1);
  return row ?? null;
}

export async function saveUserWeights(
  userId: number,
  coeff: number[][],
  intercept: number[],
) {
  const [row] = await db
    .insert(userModelHistory)
    .values({ userid: userId, coeff, intercept })
    .returning();
  return row!;
}

export async function getUserModelHistory(
  userId: number,
  limit: number,
  offset: number,
) {
  return db
    .select()
    .from(userModelHistory)
    .where(eq(userModelHistory.userid, userId))
    .orderBy(desc(userModelHistory.timestamp))
    .limit(limit)
    .offset(offset);
}
