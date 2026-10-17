import { Page } from '@playwright/test';

/**
 * Room action tiles (client/js/game-ui.js `tile()`): `button.act[data-action=…]`.
 * Resign and draw-offer are two-tap (first tap arms, second within CONFIRM_MS
 * sends) — `confirmAct` taps twice; undo/time are single-tap.
 */
export const act = (page: Page, action: string) => page.locator(`.act[data-action="${action}"]`);

export async function confirmAct(page: Page, action: string) {
  await act(page, action).click();
  await page.locator(`.act--confirm[data-action="${action}"]`).click();
}
