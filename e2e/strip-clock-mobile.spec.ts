import { test, expect, devices, Page, BrowserContext } from '@playwright/test';

/**
 * ui/strip-clock-mobile — .players-strip thay .turn-bar ở ≤768px.
 *
 * Bảo vệ 5 bất biến mà một thay đổi CSS/JS vô tình rất dễ phá:
 *   1. Ở viewport điện thoại, #turn-bar phải display:none và offsetHeight = 0.
 *      Không chỉ "khuất mắt": board.js đọc chính offsetHeight này để tính ngân
 *      sách chiều cao bàn cờ, nên visibility:hidden sẽ âm thầm ăn mất ~37px.
 *   2. Strip KHÔNG còn tự ẩn khi ván bắt đầu (hành vi cũ, đã bỏ) — nó là nơi
 *      duy nhất còn hiển thị tên/đồng hồ trên điện thoại.
 *   3. Đồng hồ thật sự đếm, và thanh --pct đi xuống theo.
 *   4. --pct luôn nằm trong [0, 100] — clamp cho blitz cộng increment.
 *   5. Đúng một dòng mang dấu ▶.
 *
 * Ngoài phạm vi tự động hoá: đường đi blitz vượt 100% (cần ván blitz cộng
 * increment đủ để dư giờ so với mốc gốc). Clamp được khẳng định gián tiếp qua
 * bất biến 4; giới hạn này là cố ý, không phải bỏ sót.
 *
 * Chạy: npx playwright test e2e/strip-clock-mobile.spec.ts --project=chromium
 */

const PHONE = devices['Pixel 5'];

test.describe('mobile players-strip carries the clocks', () => {
  test('turn bar is gone, strip shows live clocks and a bounded progress bar', async ({ browser }) => {
    test.setTimeout(120_000);

    const made: BrowserContext[] = [];
    async function guest(): Promise<Page> {
      const ctx = await browser.newContext({ ...PHONE });
      made.push(ctx);
      const page = await ctx.newPage();
      const res = await page.request.post('/api/auth/guest');
      expect(res.ok(), 'guest auth should succeed').toBeTruthy();
      const { token, displayName } = await res.json();
      await ctx.addInitScript(([t, d]) => {
        localStorage.setItem('gvn_token', t as string);
        localStorage.setItem('gvn_display_name', d as string);
        localStorage.setItem('gomoku_click_mode', 'single');
      }, [token, displayName]);
      return page;
    }

    const A = await guest();
    const B = await guest();

    await A.goto('/index.html');
    await A.click('#btn-create');
    await A.click('#btn-quick-match');
    await A.waitForURL(/room\.html/, { timeout: 20000 });
    await expect(A.locator('#room-id-nav')).not.toHaveText('', { timeout: 20000 });
    const roomId = new URL(A.url()).searchParams.get('id')!;

    await B.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
    await expect(B.locator('#room-id-nav')).not.toHaveText('', { timeout: 20000 });

    // ── Trước ván: strip đã hiện, nhưng chưa có đồng hồ lẫn thanh thời gian ──
    await expect(A.locator('#players-strip')).toBeVisible();
    expect(await A.locator('.players-strip__time').count(),
      'chưa vào ván thì không dựng đồng hồ — đó là thứ giữ nguyên chiều cao strip pre-game').toBe(0);
    expect(await A.locator('.players-strip__track').count()).toBe(0);

    // ── Vào ván ──
    await A.locator('#slot-1 .slot-card__clickable').click();
    await B.locator('#slot-2 .slot-card__clickable').click();
    await expect(A.locator('#start-modal')).toHaveClass(/visible/, { timeout: 20000 });
    await expect(B.locator('#start-modal')).toHaveClass(/visible/, { timeout: 20000 });
    await A.click('#start-modal-btn');
    await B.click('#start-modal-btn');
    await A.waitForFunction(
      () => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 25000 });

    // ── 1. Turn bar không chiếm một pixel nào ──
    const turnBar = await A.evaluate(() => {
      const el = document.getElementById('turn-bar');
      return el ? { display: getComputedStyle(el).display, h: el.offsetHeight } : null;
    });
    expect(turnBar, '#turn-bar vẫn phải tồn tại trong DOM — desktop còn dùng').not.toBeNull();
    expect(turnBar!.display).toBe('none');
    expect(turnBar!.h, 'board.js trừ thẳng offsetHeight này khỏi ngân sách bàn cờ').toBe(0);

    // ── 2. Strip vẫn hiện khi đang chơi (hành vi cũ là tự ẩn) ──
    await expect(A.locator('#players-strip')).toBeVisible();
    await expect(A.locator('.players-strip__time')).toHaveCount(2);
    await expect(A.locator('.players-strip__track')).toHaveCount(2);

    // ── 3. Đồng hồ đếm thật, thanh đi xuống theo ──
    const read = () => A.evaluate(() => ({
      times: [...document.querySelectorAll('[data-strip-time]')].map((e) => e.textContent || ''),
      pcts: [...document.querySelectorAll('.players-strip__fill')]
        .map((e) => parseFloat((e as HTMLElement).style.getPropertyValue('--pct')) || 0),
      turns: [...document.querySelectorAll('.players-strip__slot')]
        .filter((e) => e.classList.contains('players-strip__slot--turn')).length,
    }));

    const t0 = await read();
    for (const s of t0.times) {
      expect(s, `đồng hồ phải luôn ở dạng M:SS (được "${s}")`).toMatch(/^\d+:[0-5]\d$/);
    }

    await A.waitForTimeout(3000);
    const t1 = await read();

    const activeIdx = t0.pcts.findIndex((p, i) => t1.pcts[i] < p);
    expect(activeIdx, 'sau 3 giây phải có đúng đồng hồ của người đang đi rút xuống').toBeGreaterThanOrEqual(0);
    expect(t1.times[activeIdx]).not.toBe(t0.times[activeIdx]);

    // Đồng hồ của người KHÔNG tới lượt phải đứng yên.
    const idleIdx = activeIdx === 0 ? 1 : 0;
    expect(t1.pcts[idleIdx], 'đồng hồ người chờ không được chạy').toBe(t0.pcts[idleIdx]);

    // ── 4. --pct luôn bị kẹp trong [0, 100] ──
    for (const snapshot of [t0, t1]) {
      for (const p of snapshot.pcts) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p, 'clamp 100% là chủ ý — blitz cộng giờ không được vẽ tràn track').toBeLessThanOrEqual(100);
      }
    }

    // ── 5. Đúng một dòng mang dấu lượt ──
    expect(t1.turns, 'dấu ▶ thay cho nhãn "Lượt của bạn" — phải nằm ở đúng một dòng').toBe(1);

    // Rời trước khi hết giờ: không ván nào kết thúc bằng timeout, không ghi
    // dòng games nào — spec này không cần và không nên tạo dữ liệu ván đấu.
    for (const ctx of made) await ctx.close();
  });
});
