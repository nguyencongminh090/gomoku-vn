import { expect, BrowserContext, Page } from '@playwright/test';

/**
 * Shared e2e login (TODO.md #183).
 *
 * Auth is a server-side cookie session (#68). The cookie is HttpOnly, so the
 * client guard `requireAuth()` (client/js/session.js) decides from the
 * `gvn_user` localStorage flag instead. `page.request` shares the context's
 * cookie jar, so POSTing an auth endpoint through it sets the cookie, and the
 * returned `user` object is exactly what login.js stores as `gvn_user`.
 *
 * The pre-#68 `gvn_token` / `gvn_display_name` keys are no longer read for
 * identity — the server answers them with "invalid legacy token".
 */

export interface E2EUser {
  userId: string;
  displayName: string;
  isGuest: boolean;
  expiresAt?: string;
}

/** Store the user the way login.js's onAuthSuccess() does, before any page script runs. */
export async function seedSession(ctx: BrowserContext, user: E2EUser) {
  await ctx.addInitScript((u) => {
    localStorage.setItem('gvn_user', JSON.stringify(u));
  }, user);
}

async function authAs(
  ctx: BrowserContext, page: Page, path: string, data: object | undefined, what: string,
) {
  const res = await page.request.post(path, data ? { data } : undefined);
  expect(res.ok(), `${what} should succeed (${res.status()})`).toBeTruthy();
  const body = await res.json();
  expect(body.user && body.user.userId, `${what} response carries a user`).toBeTruthy();
  await seedSession(ctx, body.user);
  return { user: body.user as E2EUser, displayName: body.user.displayName as string };
}

/** Sign `ctx` in as a fresh guest (cookie + gvn_user). */
export async function authAsGuest(
  ctx: BrowserContext, page: Page, actor = 'guest', opts: { singleTap?: boolean } = {},
) {
  const r = await authAs(ctx, page, '/api/auth/guest', undefined, `${actor} guest auth`);
  if (opts.singleTap) await singleTapPlacement(ctx);
  return r;
}

/**
 * Single-tap stone placement: the default double-tap-confirm mode guards against
 * fat-finger mis-clicks on touch devices; a scripted click is precise, so this
 * saves one click per move without touching any server-side behaviour.
 */
export async function singleTapPlacement(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    localStorage.setItem('gomoku_click_mode', 'single');
  });
}

/** Register a fresh member account and sign `ctx` in as it. */
export async function authAsMember(ctx: BrowserContext, page: Page, name = 'member') {
  const username = `${name}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const password = 'testpass123';
  const displayName = `${name}${Math.random().toString(36).slice(2, 6)}`;
  const r = await authAs(ctx, page, '/api/auth/register', { username, password, displayName }, `${name} register`);
  return { ...r, username, password };
}
