import { test, expect } from '@playwright/test';

/**
 * TODO #28: socket.io's default transport order (['polling', 'websocket'])
 * measurably lost connections under a large synchronized connection burst
 * (docs/stress-test-report.md §10; re-verified in this session's TODO.md #28
 * entry). socket-client.js now passes `transports: ['websocket', 'polling']`
 * with `tryAllTransports: true` so a normal connection opens a WebSocket
 * directly instead of starting with an HTTP long-polling handshake, while
 * still falling back to polling if the WebSocket attempt is rejected outright
 * (e.g. a proxy that blocks WebSocket).
 */
test.describe('websocket-first transport', () => {
  test('a normal connection opens a WebSocket immediately, without a polling handshake first', async ({ page, context }) => {
    const res = await page.request.post('/api/auth/guest');
    const { token, displayName } = await res.json();
    await context.addInitScript(([t, d]) => {
      localStorage.setItem('gvn_token', t as string);
      localStorage.setItem('gvn_display_name', d as string);
    }, [token, displayName]);

    const pollingHandshakes: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/socket.io/') && url.includes('transport=polling')) {
        pollingHandshakes.push(url);
      }
    });

    const wsPromise = page.waitForEvent('websocket', { timeout: 15000 });
    await page.goto('/index.html');
    const ws = await wsPromise;

    expect(ws.url()).toContain('transport=websocket');
    // No polling GET should have preceded the WebSocket — that's the whole
    // point of putting websocket first instead of upgrading into it later.
    expect(pollingHandshakes).toHaveLength(0);

    // Confirm the connection actually succeeds end-to-end, not just that a
    // WebSocket was opened — the status banner should never show disconnected.
    const banner = page.locator('#status-banner');
    await expect(banner).not.toHaveClass(/visible/);
  });
});
