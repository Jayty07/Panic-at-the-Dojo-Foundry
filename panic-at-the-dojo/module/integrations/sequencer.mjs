/**
 * Sequencer integration: shouted attack names, impacts, afterimages for forced movement,
 * teleport puffs, Super Move cut-ins and an interactive destination picker.
 * Everything degrades gracefully when Sequencer (or JB2A) is not installed.
 */
import { SYS, PATD } from "../config.mjs";

const C = PATD.colors;
const FONT = "Bangers, 'Anime Ace', 'AnimeAce2.0 BB', 'Bruno Ace', 'Signika', sans-serif";

function on() {
  return game.modules.get("sequencer")?.active && globalThis.Sequence && game.settings.get(SYS, "sequencerFx");
}

/** First JB2A (or other) database entry that exists. */
function db(...paths) {
  const D = globalThis.Sequencer?.Database;
  if (!D) return null;
  for (const p of paths) { try { if (D.entryExists(p)) return p; } catch { /* noop */ } }
  return null;
}

function tokenOf(x) {
  if (!x) return null;
  if (x.document && x.center) return x;               // Token placeable
  if (x.object?.center) return x.object;              // TokenDocument
  if (x.getActiveTokens) return x.token?.object ?? x.getActiveTokens()[0] ?? null; // Actor
  return null;
}

const textStyle = (fill, size = 46) => ({
  fill, fontFamily: FONT, fontSize: size, fontWeight: "bold",
  stroke: "#101418", strokeThickness: Math.round(size / 6),
  dropShadow: true, dropShadowColor: "#000000", dropShadowDistance: 4, dropShadowAlpha: 0.6,
  align: "center"
});

function actionColor(action) {
  const t = `${action.name} ${action.text}`.toLowerCase();
  if (/burning|fire|flame|inferno|blaz/.test(t)) return "#ff6a00";
  if (/weakness|frost|ice|winter|frozen/.test(t)) return "#7fd8ff";
  if (/teleport|swap|shadow/.test(t)) return C.alpha;
  if (/heal|shield|iron/.test(t)) return "#54fe92";
  if (/damage|crush|strike|punch|smash/.test(t)) return "#fc2423";
  return "#ffd23f";
}

function play(seq) { try { return seq.play(); } catch (err) { console.warn(`${SYS} | Sequencer`, err); } }

export const FX = {

  /** Shout the action name above the user and hit each target. */
  action(actor, action, targets = [], { spent } = {}) {
    if (!on()) return;
    const src = tokenOf(actor);
    if (!src) return;
    const color = actionColor(action);
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    // ring pulse under the user
    seq.effect()
      .atLocation(src).shape("circle", { radius: canvas.grid.size * 0.6, fillColor: color, fillAlpha: 0.25, lineSize: 6, lineColor: color })
      .belowTokens().scaleIn(0.2, 250, { ease: "easeOutBack" }).fadeOut(450).duration(900);
    // shouted name, comic style
    seq.effect()
      .atLocation(src, { offset: { y: -canvas.grid.size * 0.9 } })
      .text(`${action.name.toUpperCase()}!`, textStyle(color, 44))
      .anchor({ x: 0.5, y: 1 })
      .scaleIn(0.3, 280, { ease: "easeOutBack" })
      .animateProperty("sprite", "position.y", { from: 0, to: -24, duration: 1300, ease: "easeOutCubic" })
      .fadeOut(350).duration(1500).aboveInterface?.();
    const dmg = /damage/i.test(action.text);
    if (dmg && targets.length) for (const t of targets) this._hit(seq, src, t, color);
    play(seq);
  },

  _hit(seq, src, target, color) {
    const d = canvas.grid.measurePath ? canvas.grid.measurePath([src.center, target.center]).spaces : 1;
    const melee = d <= 1.5;
    const file = melee
      ? db("jb2a.unarmed_strike.physical.01", "jb2a.melee_generic.slash.01", "jb2a.flurry_of_blows.physical")
      : db("jb2a.energy_strands.range.standard", "jb2a.magic_missile", "jb2a.bullet.01", "jb2a.ranged.03.projectile.01");
    if (file) {
      seq.effect().file(file).atLocation(src).stretchTo(target).randomizeMirrorY();
    } else {
      seq.effect().atLocation(target).shape("circle", { radius: canvas.grid.size * 0.45, fillColor: color, fillAlpha: 0.6 })
        .scaleIn(0.1, 150, { ease: "easeOutQuint" }).fadeOut(300).duration(500);
    }
    const impact = db("jb2a.impact.ground_crack.orange", "jb2a.impact.004", "jb2a.impact.001");
    if (impact) seq.effect().file(impact).atLocation(target).scaleToObject(1.6).delay(melee ? 200 : 450);
    seq.effect().atLocation(target, { offset: { y: -canvas.grid.size * 0.4 } })
      .text(["POW!", "WHAM!", "KRAK!", "THWACK!", "BAM!"][Math.floor(Math.random() * 5)], textStyle("#ffffff", 34))
      .delay(melee ? 150 : 400).scaleIn(0.4, 160, { ease: "easeOutBack" }).fadeOut(250).duration(700);
  },

  strike(src, target) {
    if (!on() || !src || !target) return;
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    this._hit(seq, src, target, "#fc2423");
    seq.canvasPan?.().shake({ duration: 220, strength: 4 });
    play(seq);
  },

  superMove(actor, item, targets = []) {
    if (!on()) return;
    const src = tokenOf(actor);
    const alpha = item.system.superType === "alpha";
    const color = alpha ? "#ff3fd8" : "#28d0ff";
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    // Screen cut-in banner
    seq.effect()
      .screenSpace().screenSpaceAboveUI().screenSpaceAnchor({ x: 0.5, y: 0.35 })
      .text(`${alpha ? "α" : "Δ"} SUPER`, textStyle(color, 96))
      .scaleIn(2.5, 300, { ease: "easeOutExpo" }).fadeOut(400).duration(1600);
    seq.effect()
      .screenSpace().screenSpaceAboveUI().screenSpaceAnchor({ x: 0.5, y: 0.5 })
      .text(item.name.toUpperCase(), textStyle("#ffffff", 64))
      .delay(250).scaleIn(0.2, 300, { ease: "easeOutBack" }).fadeOut(400).duration(1800);
    seq.canvasPan?.().shake({ duration: 900, strength: 10, rotation: false });
    if (src) {
      const burst = db("jb2a.extras.tmfx.outpulse.circle.01.fast", "jb2a.impact.ground_crack.white", "jb2a.shockwave.01");
      if (burst) seq.effect().file(burst).atLocation(src).scaleToObject(3).belowTokens();
      else seq.effect().atLocation(src).shape("circle", { radius: canvas.grid.size * 1.4, fillColor: color, fillAlpha: 0.3, lineSize: 10, lineColor: color })
        .belowTokens().scaleIn(0.1, 400, { ease: "easeOutCubic" }).fadeOut(500).duration(1200);
      for (const t of targets) this._hit(seq, src, t, color);
    }
    play(seq);
  },

  challenge(src, target) {
    if (!on() || !target) return;
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    seq.effect().atLocation(target, { offset: { y: -canvas.grid.size * 0.8 } })
      .text("CHALLENGED!", textStyle("#ffd23f", 36)).scaleIn(0.3, 250, { ease: "easeOutBack" }).fadeOut(300).duration(1300);
    const line = db("jb2a.energy_beam.normal.yellow", "jb2a.chain_lightning.primary.yellow");
    if (src && line) seq.effect().file(line).atLocation(src).stretchTo(target).duration(900).fadeOut(300);
    play(seq);
  },

  shield(actor, value, temp = false) {
    if (!on()) return;
    const t = tokenOf(actor); if (!t) return;
    const file = db("jb2a.shield.01.intro.blue", "jb2a.shield.02.intro.blue");
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    if (file) seq.effect().file(file).atLocation(t).scaleToObject(1.6);
    else seq.effect().atLocation(t).shape("circle", { radius: canvas.grid.size * 0.6, lineSize: 8, lineColor: "#28d0ff", fillAlpha: 0 })
      .scaleIn(0.5, 250).fadeOut(400).duration(900);
    seq.effect().atLocation(t, { offset: { y: -canvas.grid.size * 0.7 } }).text(temp ? "ARMOR UP!" : `SHIELD ${value}`, textStyle("#28d0ff", 30)).fadeOut(300).duration(1100);
    play(seq);
  },

  damage(actor, dmg, { barBroke, takenOut, bled } = {}) {
    if (!on()) return;
    const t = tokenOf(actor); if (!t) return;
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    if (dmg > 0) seq.animation().on(t).opacity(0.35).duration(80).waitUntilFinished?.();
    if (dmg > 0) seq.animation().on(t).opacity(1).duration(120);
    const big = takenOut ? "K.O.!" : barBroke ? "BAR BROKEN!" : bled ? "BLEEDING!" : null;
    if (big) {
      seq.effect().atLocation(t, { offset: { y: -canvas.grid.size } })
        .text(big, textStyle(takenOut ? "#fc2423" : barBroke ? "#ffd23f" : "#ff5b5b", takenOut ? 64 : 42))
        .scaleIn(3, 300, { ease: "easeOutExpo" }).fadeOut(500).duration(1800);
      if (takenOut || barBroke) {
        const stars = db("jb2a.dizzy_stars.400px.yellow", "jb2a.dizzy_stars");
        if (stars) seq.effect().file(stars).attachTo(t).scaleToObject(1.2).duration(3000).fadeOut(500);
        seq.canvasPan?.().shake({ duration: 400, strength: 8 });
      }
    }
    play(seq);
  },

  heal(actor, n) {
    if (!on() || !n) return;
    const t = tokenOf(actor); if (!t) return;
    const file = db("jb2a.healing_generic.200px.green", "jb2a.cure_wounds.400px.green");
    if (!file) return;
    play(new Sequence({ moduleName: SYS, softFail: true }).effect().file(file).atLocation(t).scaleToObject(1.4));
  },

  tokenChange() { /* numbers are shown by the scrolling text hook */ },

  async forced(src, target, pos, kind) {
    if (!on()) return;
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    // afterimage at the starting point
    seq.effect().copySprite(target).atLocation(target).opacity(0.5).tint(kind === "push" ? "#fc2423" : "#527afd").fadeOut(600).duration(700).belowTokens();
    const dust = db("jb2a.impact.ground_crack.still_frame.01", "jb2a.smoke.puff.side.grey");
    if (dust) seq.effect().file(dust).atLocation(target).scaleToObject(1.2);
    seq.effect().atLocation(target, { offset: { y: -canvas.grid.size * 0.7 } })
      .text(kind === "push" ? "SHOVE!" : "YOINK!", textStyle(kind === "push" ? "#fc2423" : "#7fa0ff", 34)).fadeOut(300).duration(900);
    play(seq);
  },

  teleport(token, dest) {
    if (!on()) return;
    const puff = db("jb2a.misty_step.01.purple", "jb2a.misty_step.01.blue", "jb2a.smoke.puff.centered.grey");
    const seq = new Sequence({ moduleName: SYS, softFail: true });
    const center = { x: dest.x + token.w / 2, y: dest.y + token.h / 2 };
    if (puff) { seq.effect().file(puff).atLocation(token).scaleToObject(1.5); seq.effect().file(puff).atLocation(center).scaleToObject(1.5).delay(250); }
    else {
      seq.effect().atLocation(token).shape("circle", { radius: canvas.grid.size * 0.5, fillColor: C.alpha, fillAlpha: 0.5 }).scaleOut(0, 400).duration(450);
      seq.effect().atLocation(center).shape("circle", { radius: canvas.grid.size * 0.5, fillColor: C.alpha, fillAlpha: 0.5 }).scaleIn(0, 400).fadeOut(300).duration(600);
    }
    play(seq);
  },

  /**
   * Interactive destination picker. Uses Sequencer's Crosshair when available,
   * otherwise a simple click-to-place on the canvas.
   * @returns {Promise<{x:number,y:number}|null>} a canvas point (center)
   */
  async pickLocation({ origin, range = 1, label = "Choose a space", color = "#ffd23f" } = {}) {
    const units = range * (canvas.scene?.grid?.distance ?? 1);
    const XH = globalThis.Sequencer?.Crosshair;
    if (game.modules.get("sequencer")?.active && XH?.show && game.settings.get(SYS, "sequencerCrosshair")) {
      try {
        const res = await XH.show({
          size: 1, gridHighlight: true, label: { text: label },
          borderColor: color, fillColor: color, fillAlpha: 0.25,
          location: origin ? { obj: origin, limitMaxRange: units, showRange: true } : undefined,
          snap: { position: CONST.GRID_SNAPPING_MODES.CENTER }
        });
        if (!res) return null;
        return { x: res.x, y: res.y };
      } catch (err) { console.warn(`${SYS} | Crosshair failed, falling back`, err); }
    }
    return clickPicker({ origin, range, label });
  }
};

// Never let a cosmetic effect break game logic.
for (const [k, fn] of Object.entries(FX)) {
  if (typeof fn !== "function" || k === "pickLocation") continue;
  FX[k] = function (...args) {
    try {
      const r = fn.apply(FX, args);
      return r?.catch ? r.catch(err => console.warn(`${SYS} | FX.${k}`, err)) : r;
    } catch (err) { console.warn(`${SYS} | FX.${k}`, err); }
  };
}

function clickPicker({ origin, range, label }) {
  return new Promise((resolve) => {
    ui.notifications.info(`${label}: left-click a space on the map (right-click or Esc to cancel).`);
    const stage = canvas.stage;
    const done = (v) => { stage.off("pointerdown", onDown); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    const onDown = (ev) => {
      if (ev.button === 2) return done(null);
      if (ev.button !== 0) return;
      const p = canvas.mousePosition ?? ev.getLocalPosition?.(stage);
      if (!p) return done(null);
      if (origin && canvas.grid.measurePath) {
        const d = canvas.grid.measurePath([origin.center, p]).spaces;
        if (d > range + 0.5) ui.notifications.warn(`That space is ${Math.round(d)} away (limit ${range}).`);
      }
      done({ x: p.x, y: p.y });
    };
    stage.on("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
  });
}

/* -------------------------------------------- */
/*  Floating numbers (all clients, no modules)  */
/* -------------------------------------------- */

export function registerScrollingText() {
  Hooks.on("updateActor", (actor, changes, options) => {
    const fx = options?.[SYS]?.fx;
    if (!fx || !canvas?.ready) return;
    const tokens = actor.getActiveTokens(true);
    for (const t of tokens) {
      if (!t.visible) continue;
      const style = { anchor: CONST.TEXT_ANCHOR_POINTS.TOP, direction: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 36, stroke: 0x101418, strokeThickness: 6, jitter: 0.2, fontFamily: FONT };
      canvas.interface.createScrollingText(t.center, fx.text, { ...style, fill: fx.color ?? "#ffffff" });
    }
  });
}
