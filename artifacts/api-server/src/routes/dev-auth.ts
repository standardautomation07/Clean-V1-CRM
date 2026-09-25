import { db, usersTable } from '@workspace/db';
import { Router, type IRouter, type Request, type Response } from 'express';

import {
  clearSession,
  createSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
} from '../lib/auth';

// Local-development replacement for the Replit OIDC login. Only mounted when
// LOCAL_DEV_AUTH=true and NODE_ENV is not production (see routes/index.ts).
// It signs the browser in as a fixed local user so the CRM can run on
// localhost without Replit. Never enable this in a deployed environment.

const LOCAL_USER = {
  id: process.env.LOCAL_DEV_USER_ID ?? 'local-dev-user',
  email: process.env.LOCAL_DEV_USER_EMAIL ?? 'dev@example.com',
  firstName: process.env.LOCAL_DEV_USER_FIRST_NAME ?? 'Local',
  lastName: process.env.LOCAL_DEV_USER_LAST_NAME ?? 'Developer',
  profileImageUrl: null,
};

export function isLocalDevAuthEnabled(): boolean {
  return process.env.LOCAL_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production';
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

const router: IRouter = Router();

router.get('/login', async (req: Request, res: Response) => {
  const [user] = await db
    .insert(usersTable)
    .values(LOCAL_USER)
    .onConflictDoUpdate({ target: usersTable.id, set: { ...LOCAL_USER, updatedAt: new Date() } })
    .returning();

  const sid = await createSession({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
    access_token: 'local-dev',
  });

  // Plain http on localhost, so the cookie cannot be marked secure.
  res.cookie(SESSION_COOKIE, sid, { httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: SESSION_TTL });
  res.redirect(303, getSafeReturnTo(req.query.returnTo));
});

router.get('/logout', async (req: Request, res: Response) => {
  await clearSession(res, getSessionId(req));
  res.redirect(303, getSafeReturnTo(req.query.returnTo));
});

export default router;
