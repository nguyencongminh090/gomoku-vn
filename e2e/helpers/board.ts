import { Page } from '@playwright/test';

/**
 * Where board cell (x, y) is, as a `position` for `page.locator('#game-canvas')`
 * (relative to the board SVG's top-left). The renderer's `geo` is in SVG
 * units ({ m, VW, vx, vy, VH }); the SVG is scaled to its CSS size, so invert
 * `BoardRenderer._cellFromClient` (client/js/board.js). P = 40 SVG units/cell.
 * Waits for `geo`: it is computed off a requestAnimationFrame after the game
 * starts, and a click before that lands on no cell.
 */
const CELL = 40;

export async function cellPosition(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  await page.waitForFunction(() => !!(window as any).RoomState?.boardRenderer?.geo, null, { timeout: 10000 });
  return page.evaluate(([cx, cy, P]) => {
    const br = (window as any).RoomState.boardRenderer;
    const g = br.geo;
    const rect = br.svg.getBoundingClientRect();
    return {
      x: (g.m + (cx + 0.5) * P - g.vx) * (rect.width / g.VW),
      y: (g.m + (cy + 0.5) * P - g.vy) * (rect.height / g.VH),
    };
  }, [x, y, CELL] as const);
}
