import crypto from 'node:crypto';
import { db, usersTable } from '@workspace/db';
import { Router, type IRouter, type Request, type Response } from 'express';

import { clearSession, createSession, getSessionId, SESSION_COOKIE, SESSION_TTL } from '../lib/auth';

// Shared-password sign-in for deployments that cannot use Replit OIDC (for
// example Vercel). Enabled only when SITE_PASSWORD is set. Everyone who knows
// the password works as the same CRM user, so all leads live in one workspace.
// Mounted before the OIDC routes, so it takes over /login and /logout.

const SITE_USER = {
  id: process.env.SITE_USER_ID ?? 'crm-workspace',
  email: process.env.SITE_USER_EMAIL ?? 'sales@rollvento.in',
  firstName: process.env.SITE_USER_FIRST_NAME ?? 'Rollvento',
  lastName: process.env.SITE_USER_LAST_NAME ?? 'Sales',
  profileImageUrl: null,
};

export function isPasswordAuthEnabled(): boolean {
  return Boolean(process.env.SITE_PASSWORD?.trim());
}

function passwordMatches(candidate: string): boolean {
  const expected = Buffer.from(process.env.SITE_PASSWORD ?? '', 'utf8');
  const given = Buffer.from(candidate, 'utf8');
  if (expected.length === 0 || expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function loginPage(returnTo: string, error: string | null): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in · Rollvento CRM</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1f2a30;color:#f3f1ec;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  form{width:min(92vw,360px);background:#26333a;border:1px solid #35444c;border-radius:16px;padding:32px 28px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  h1{margin:0 0 4px;font-size:22px;letter-spacing:-.03em}p{margin:0 0 20px;color:#b7c0c6;font-size:13px}
  label{display:block;font-size:12px;font-weight:600;color:#c9d1d6;margin-bottom:6px}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid #46565f;background:#1f2a30;color:#f3f1ec;font-size:15px}
  input:focus{outline:none;border-color:#e8683a;box-shadow:0 0 0 3px rgba(232,104,58,.25)}
  button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:9px;background:#e8683a;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
  .err{margin:0 0 14px;padding:10px 12px;border-radius:9px;background:rgba(220,80,60,.15);border:1px solid rgba(220,80,60,.4);color:#ffb4a6;font-size:13px}
  .brand{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.18em;color:#e8683a;margin-bottom:14px}
</style></head><body>
<form method="post" action="/api/login">
  <div class="brand">ROLLVENTO · CRM</div>
  <h1>Sign in</h1>
  <p>Enter the workspace password to continue.</p>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
  <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
  <label for="password">Workspace password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
  <button type="submit">Log in</button>
</form>
</body></html>`;
}

const router: IRouter = Router();

router.get('/login', (req: Request, res: Response) => {
  if (req.isAuthenticated()) {
    res.redirect(getSafeReturnTo(req.query.returnTo));
    return;
  }
  res.type('html').send(loginPage(getSafeReturnTo(req.query.returnTo), typeof req.query.error === 'string' ? 'Incorrect password. Please try again.' : null));
});

router.post('/login', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { password?: unknown; returnTo?: unknown };
  const returnTo = getSafeReturnTo(body.returnTo);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!passwordMatches(password)) {
    // Slow down guessing a little; the password is the only secret here.
    await new Promise((resolve) => setTimeout(resolve, 750));
    res.redirect(303, `/api/login?error=1&returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }
  const [user] = await db
    .insert(usersTable)
    .values(SITE_USER)
    .onConflictDoUpdate({ target: usersTable.id, set: { ...SITE_USER, updatedAt: new Date() } })
    .returning();
  const sid = await createSession({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl },
    access_token: 'site-password',
  });
  res.cookie(SESSION_COOKIE, sid, { httpOnly: true, secure: req.secure || req.headers['x-forwarded-proto'] === 'https', sameSite: 'lax', path: '/', maxAge: SESSION_TTL });
  res.redirect(303, returnTo);
});

router.get('/logout', async (req: Request, res: Response) => {
  await clearSession(res, getSessionId(req));
  res.redirect(303, getSafeReturnTo(req.query.returnTo));
});

export default router;
