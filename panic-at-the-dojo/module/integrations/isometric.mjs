/**
 * Isometric support: float token bars (core bars or Bar Brawl) and nameplates
 * above the sprite's head when the Isometric Perspective module is active.
 *
 * The isometric module rotates and skews the whole canvas stage, then counter-transforms
 * only each token's mesh so the art stands upright. Bars and nameplates are children of
 * the Token placeable and would otherwise lie flat on the floor diamond. Each frame we give
 * them the mesh's counter-transform, an undistorted scale, and pin them above the art.
 */
import { SYS } from "../config.mjs";

const EPS = 1e-4;
const touched = new WeakSet();
let ticking = false;

const isSkewed = (o) => !!o && (Math.abs(o.rotation) > EPS || Math.abs(o.skew?.x ?? 0) > EPS || Math.abs(o.skew?.y ?? 0) > EPS);

function stageIsometric() {
  const s = canvas?.app?.stage;
  return isSkewed(s);
}

function barContainers(token) {
  const list = [];
  if (token.bars && !token.bars.destroyed) list.push(token.bars);
  for (const c of token.children ?? []) {
    if (c && c !== token.bars && /barbrawl/i.test(c.name ?? "") && !c.destroyed) list.push(c);
  }
  return list;
}

let CFG = { scale: 1, offset: 6, nameplate: true };

function counterTransform(target, mesh, token) {
  target.rotation = mesh.rotation;
  target.skew.set(mesh.skew.x, mesh.skew.y);
  target.scale.set(1, 1);
  // Measure how the token's world transform plus the counter-transform maps local units
  // (same maths as PIXI's Transform: rotation r with skew sx/sy, unit scale)
  const r = mesh.rotation, sx = mesh.skew.x, sy = mesh.skew.y;
  const la = Math.cos(r + sy), lb = Math.sin(r + sy), lc = -Math.sin(r - sx), ld = Math.cos(r - sx);
  const W = token.worldTransform;
  const ma = W.a * la + W.c * lb, mb = W.b * la + W.d * lb;
  const mc = W.a * lc + W.c * ld, md = W.b * lc + W.d * ld;
  const ux = Math.hypot(ma, mb) || 1;
  const uy = Math.hypot(mc, md) || 1;
  const zoom = canvas.stage.scale.x;
  const k = CFG.scale;
  target.scale.set((zoom / ux) * k, (zoom / uy) * k);
  return { ux, uy, zoom };
}

function floatToken(token) {
  const mesh = token.mesh;
  if (!mesh || mesh.destroyed || !mesh.visible || !mesh.renderable) return;
  if (!isSkewed(mesh)) { resetToken(token); return; }
  const bounds = mesh.getBounds(false);
  const offset = CFG.offset * canvas.stage.scale.x;
  let headY = bounds.y - offset;
  const headX = bounds.x + bounds.width / 2;

  for (const c of barContainers(token)) {
    if (!c.visible) continue;
    touched.add(token);
    const { zoom } = counterTransform(c, mesh, token);
    const lb = c.getLocalBounds();
    if (!lb.width || !lb.height) continue;
    c.pivot.set(lb.x + lb.width / 2, lb.y + lb.height);
    const local = token.toLocal(new PIXI.Point(headX, headY));
    c.position.set(local.x, local.y);
    headY -= lb.height * zoom * CFG.scale + 2; // screen-space height of this stack
  }

  const np = token.nameplate;
  if (np && !np.destroyed && np.visible && CFG.nameplate) {
    touched.add(token);
    counterTransform(np, mesh, token);
    np.anchor?.set(0.5, 1);
    const local = token.toLocal(new PIXI.Point(headX, headY - 2));
    np.position.set(local.x, local.y);
  }
}

function resetToken(token) {
  if (!touched.has(token)) return;
  touched.delete(token);
  for (const c of barContainers(token)) {
    c.rotation = 0; c.skew.set(0, 0); c.scale.set(1, 1); c.pivot.set(0, 0); c.position.set(0, 0);
  }
  const np = token.nameplate;
  if (np && !np.destroyed) { np.rotation = 0; np.skew.set(0, 0); np.scale.set(1, 1); np.anchor?.set(0.5, 0); }
  token.renderFlags?.set({ refreshBars: true, refreshNameplate: true, refreshState: true });
}

function tick() {
  if (!canvas?.ready || !canvas.tokens) return;
  const enabled = game.settings.get(SYS, "isoFloatBars");
  CFG = { scale: game.settings.get(SYS, "isoBarScale"), offset: game.settings.get(SYS, "isoBarOffset"), nameplate: game.settings.get(SYS, "isoFloatNameplate") };
  const iso = enabled && stageIsometric();
  for (const t of canvas.tokens.placeables) {
    if (t.destroyed) continue;
    if (iso) floatToken(t);
    else resetToken(t);
  }
}

export function registerIsometric() {
  Hooks.on("canvasReady", () => {
    if (ticking) canvas.app.ticker.remove(tick);
    // Runs after Foundry's render-flag pass (OBJECTS priority) and before the renderer (LOW).
    canvas.app.ticker.add(tick, null, PIXI.UPDATE_PRIORITY.NORMAL - 10);
    ticking = true;
  });
  Hooks.on("canvasTearDown", () => { try { canvas.app?.ticker?.remove(tick); } catch { /* noop */ } ticking = false; });
}
