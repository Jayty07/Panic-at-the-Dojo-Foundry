/**
 * The Initiative Meter. Slots = (health bars per side) × (number of sides), alternating
 * Hero / Enemy / Renegade. Any unit on the side whose slot is up may take it, as long as it has
 * turns left this Round (one per Health Bar it started the fight with).
 */
import { PATD, SYS, SYS_PATH } from "./config.mjs";
import { postCard, esc } from "./chat.mjs";
import { socketRequest } from "./socket.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;
const SIDES = { heroes: "Heroes", enemies: "Enemies", renegades: "Renegades" };

export function sideOf(combatant) {
  const flag = combatant.getFlag(SYS, "side");
  if (flag) return flag;
  const d = combatant.token?.disposition ?? combatant.actor?.prototypeToken?.disposition;
  if (d === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return "heroes";
  if (d === CONST.TOKEN_DISPOSITIONS.NEUTRAL) return "renegades";
  return "enemies";
}

export class PatdCombat extends Combat {
  get meter() { return this.getFlag(SYS, "meter") ?? null; }

  async startCombat() {
    const r = await super.startCombat();
    if (game.user.isGM) {
      await game.patd.meter.buildRound(this, 1);
      await postCard({ actor: null, kind: "meter", title: "Combat Start", subtitle: game.patd.weight().label,
        body: `<p>Apply Battle Parameters, draw the arena, place obstacles and units.</p>
          <p><b>Declare Stances:</b> Enemies first (Stooges, then Warriors, then Bosses), then Heroes. Everyone fights their first turn in the declared Stance.</p>
          <p class="patd-note">Heal Value ${game.patd.weight().heal} · Bleed Value ${game.patd.weight().bleed} · ${game.patd.weight().hp} HP per Health Bar · Super Moves per side per Round: ${game.patd.weight().supers}</p>` });
      game.patd.meterApp.render({ force: true });
      // Don't block startCombat on dialogs.
      Meter.declareStances(this);
    }
    return r;
  }

  async nextTurn() {
    if (!game.user.isGM) return socketRequest("meter", { op: "endTurn" });
    return game.patd.meter.endTurn();
  }

  async nextRound() {
    if (!game.user.isGM) return this;
    return game.patd.meter.newRound(this);
  }
}

/* -------------------------------------------- */
/*  Meter logic (GM side)                       */
/* -------------------------------------------- */

export const Meter = {
  combat() { return game.combat; },

  sideCounts(combat) {
    const counts = {};
    for (const c of combat.combatants) {
      if (!c.actor) continue;
      const s = sideOf(c);
      counts[s] = (counts[s] ?? 0) + (c.actor.system.turnsPerRound ?? 1);
    }
    return counts;
  },

  async buildRound(combat = this.combat(), round = null) {
    if (!combat) return;
    const counts = this.sideCounts(combat);
    const sides = Object.keys(SIDES).filter(s => counts[s]);
    const n = Math.max(0, ...sides.map(s => counts[s]));
    const slots = [];
    for (let i = 0; i < n; i++) for (const s of sides) slots.push({ side: s, combatantId: null });
    const meter = { slots, index: 0, used: {}, supers: {} };
    const updates = { [`flags.${SYS}.meter`]: meter };
    if (round !== null) updates.round = round;
    await combat.update(updates);
  },

  activeSlot(combat = this.combat()) {
    const m = combat?.meter; if (!m) return null;
    return m.slots[m.index] ?? null;
  },

  remaining(combat, combatant) {
    const m = combat.meter; if (!m) return 0;
    return (combatant.actor?.system.turnsPerRound ?? 1) - (m.used[combatant.id] ?? 0);
  },

  async take(combatantId, { override = false } = {}) {
    const combat = this.combat(); if (!combat?.meter) return;
    const m = foundry.utils.deepClone(combat.meter);
    const slot = m.slots[m.index];
    const c = combat.combatants.get(combatantId);
    if (!slot || !c) return;
    if (slot.combatantId) return ui.notifications.warn("This slot is already taken. End the current turn first.");
    if (!override && sideOf(c) !== slot.side) return ui.notifications.warn(`It is the ${SIDES[slot.side]}' turn.`);
    if (!override && this.remaining(combat, c) <= 0) return ui.notifications.warn(`${c.name} has no turns left this Round.`);
    slot.combatantId = c.id;
    m.used[c.id] = (m.used[c.id] ?? 0) + 1;
    const turn = combat.turns.findIndex(t => t.id === c.id);
    await combat.update({ turn, [`flags.${SYS}.meter`]: m });
    await postCard({ actor: c.actor, kind: "meter", title: `${c.name} takes the turn`, subtitle: `${SIDES[slot.side]} slot ${m.index + 1} of ${m.slots.length} · Round ${combat.round}`,
      body: c.actor?.system.takenOut ? `<p class="patd-callout out">Taken Out: choose a Stance, then donate your dice with <b>Heroic Spirit</b>, or pay 3 HP to come back if removed from play.</p>` : `<p class="patd-note">1 Stance Select · 2 Start · 3 Heroic Spirit · 4 Action Dice · 5 Early Movement · 6 Actions & Reactions · 7 Late Movement · 8 End</p>` });
  },

  async endTurn() {
    const combat = this.combat(); if (!combat?.meter) return;
    const m = foundry.utils.deepClone(combat.meter);
    const slot = m.slots[m.index];
    // Everyone discards 3 Speed, empties their pool, Dizzy ends, Armor resets.
    for (const c of combat.combatants) if (c.actor) await c.actor.endTurnCleanup();
    m.index += 1;
    if (m.index >= m.slots.length) return this.newRound(combat);
    await combat.update({ [`flags.${SYS}.meter`]: m });
    const next = m.slots[m.index];
    ui.notifications.info(`Next: ${SIDES[next.side]} slot.`);
  },

  async newRound(combat = this.combat()) {
    if (!combat) return;
    const fightGoesOn = combat.getFlag(SYS, "fightGoesOn") ?? false;
    const heal = game.patd.weight().heal * 2;
    const notes = [];
    if (fightGoesOn) {
      for (const c of combat.combatants) if (c.actor) await c.actor.heal(heal, { silent: true });
      notes.push(`The Fight Must Go On! Everyone heals ${heal}.`);
    }
    notes.push("Comeback Rule: anyone removed from play may return within 3 spaces of the Arena's edge for free.");
    await this.buildRound(combat, combat.round + 1);
    await postCard({ actor: null, kind: "meter", title: `Round ${combat.round}`, body: notes.map(n => `<p>${esc(n)}</p>`).join("") });
  },

  /* ---------- Combat Start: declare Stances (rulebook p. 65) ---------- */

  async declareStances(combat = this.combat()) {
    if (!combat || !game.user.isGM) return;
    const rank = (c) => sideOf(c) === "heroes" ? 9 : ({ stooges: 0, warrior: 1, boss: 2 }[c.actor.type] ?? 3);
    const list = combat.combatants.contents.filter(c => c.actor).sort((a, b) => rank(a) - rank(b));
    for (const c of list) await c.actor.update({ "system.declaredStance": false });
    const playerOwner = (c) => game.users.find(u => u.active && !u.isGM && c.actor.testUserPermission(u, "OWNER"));
    // 1) Enemies declare first, in order: Stooges, Warriors, Bosses (the GM picks).
    const enemies = list.filter(c => sideOf(c) !== "heroes" && !playerOwner(c));
    if (enemies.length) await declareDialog(enemies.map(c => c.actor), { title: "Enemies declare their Stances", intro: "Stooges, then Warriors, then Bosses. Heroes declare after seeing these." });
    // 2) Heroes declare. Connected players choose for themselves; the GM covers anyone else.
    const heroes = list.filter(c => sideOf(c) === "heroes" || playerOwner(c));
    const gmHeroes = heroes.filter(c => !playerOwner(c));
    for (const c of heroes) {
      const u = playerOwner(c);
      if (u) socketRequest("declareStance", { actorUuid: c.actor.uuid, combatId: combat.id }, u.id);
    }
    if (gmHeroes.length) await declareDialog(gmHeroes.map(c => c.actor), { title: "Declare Stances (no connected player)", intro: "These fighters have no connected owner, so the GM declares for them." });
    rerender();
  },

  /** Combatants that still need to declare a Stance. */
  undeclared(combat = this.combat()) {
    return (combat?.combatants.contents ?? []).filter(c => c.actor && !c.actor.system.declaredStance);
  },

  /** Number of turns this actor's combatant has taken this Round. */
  turnsTaken(actor, combat = this.combat()) {
    const c = combat?.combatants.find(x => x.actor?.id === actor.id);
    return c ? (combat.meter?.used?.[c.id] ?? 0) : 0;
  },

  async recordSuper(actorId) {
    const combat = this.combat(); if (!combat?.meter) return;
    const c = combat.combatants.find(x => x.actor?.id === actorId);
    if (!c) return;
    const m = foundry.utils.deepClone(combat.meter);
    const s = sideOf(c);
    m.supers[s] = (m.supers[s] ?? 0) + 1;
    await combat.update({ [`flags.${SYS}.meter`]: m });
  },

  /** Socket entry point for players. */
  async handle(data, from) {
    if (data.op === "take") {
      const c = game.combat?.combatants.get(data.combatantId);
      if (!c || !c.actor?.testUserPermission(from, "OWNER")) return;
      return this.take(data.combatantId);
    }
    if (data.op === "endTurn") {
      const slot = this.activeSlot();
      const c = slot?.combatantId ? game.combat.combatants.get(slot.combatantId) : null;
      if (c && !c.actor?.testUserPermission(from, "OWNER")) return;
      return this.endTurn();
    }
    if (data.op === "super") return this.recordSuper(data.actorId);
    if (data.op === "declared") rerender();
  }
};

const rerender = () => { if (game.patd?.meterApp?.rendered) game.patd.meterApp.render(); };

/**
 * Stance declaration dialog for one or more actors (GM for enemies, players for their Heroes).
 * Shows Stances already declared this fight so later declarers can react.
 */
export async function declareDialog(actors, { title = "Declare your Stance", intro = "" } = {}) {
  actors = actors.filter(a => a);
  if (!actors.length) return;
  const combat = game.combat;
  const declared = (combat?.combatants.contents ?? []).filter(c => c.actor?.system.declaredStance && !actors.includes(c.actor))
    .map(c => `<li><b>${esc(c.name)}</b>: ${esc(c.actor.activeStance?.name ?? "—")}</li>`).join("");
  const rows = actors.map(a => {
    const stances = a.stances;
    const frantic = a.type === "hero" && a.system.heroType === "frantic";
    const archs = a.archetypes.filter(x => x.system.mode === "frantic");
    if (!stances.length) return `<div class="patd-declare-row"><img src="${a.img}"/><b>${esc(a.name)}</b><em>has no Stances — add one on the sheet.</em></div>`;
    return `<div class="patd-declare-row"><img src="${a.img}"/><b>${esc(a.name)}</b>
      <select name="s_${a.id}">${stances.map(s => `<option value="${s.id}" ${s.id === a.system.activeStance ? "selected" : ""}>${esc(s.name)} (Range ${s.system.range.min}${s.system.range.max !== s.system.range.min ? "-" + s.system.range.max : ""})</option>`).join("")}</select>
      ${frantic && archs.length ? `<select name="f_${a.id}">${archs.map(x => `<option value="${x.id}" ${x.id === a.system.franticAbility ? "selected" : ""}>Frantic ${esc(x.name)}</option>`).join("")}</select>` : ""}</div>`;
  }).join("");
  const content = `<div class="patd-form patd-declare">
    ${intro ? `<p>${esc(intro)}</p>` : ""}
    ${declared ? `<p class="patd-note"><b>Already declared:</b></p><ul class="patd-reminders">${declared}</ul>` : ""}
    ${rows}
    <p class="patd-note">Rulebook p. 65: you must remain in this Stance until the start of your second turn.</p>
  </div>`;
  const res = await DialogV2.wait({
    window: { title }, classes: ["patd-dialog"], position: { width: 520 }, content,
    buttons: [{ action: "ok", label: "Declare", icon: "fa-solid fa-hand-fist", default: true, callback: (e, b) => {
      const out = {};
      for (const a of actors) out[a.id] = { stance: b.form.elements[`s_${a.id}`]?.value ?? "", frantic: b.form.elements[`f_${a.id}`]?.value ?? "" };
      return out;
    } }],
    rejectClose: false
  });
  if (!res) return;
  const lines = [];
  for (const a of actors) {
    const r = res[a.id]; if (!r?.stance) continue;
    const upd = { "system.activeStance": r.stance, "system.declaredStance": true };
    if (r.frantic) {
      const st = a.items.get(r.stance);
      upd["system.franticAbility"] = r.frantic;
      upd["system.lastFrantic"] = { archetype: r.frantic, style: st?.system.styleName ?? "", form: st?.system.formName ?? "" };
    }
    await a.update(upd);
    lines.push(`<li><b>${esc(a.name)}</b>: ${esc(a.items.get(r.stance)?.name ?? "")}</li>`);
  }
  if (lines.length) await postCard({ actor: actors.length === 1 ? actors[0] : null, kind: "meter", title: "Stances Declared", body: `<ul class="patd-reminders">${lines.join("")}</ul>` });
  if (!game.user.isGM) socketRequest("meter", { op: "declared" });
  rerender();
}

/* -------------------------------------------- */
/*  Meter window                                */
/* -------------------------------------------- */

export class InitiativeMeterApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "patd-initiative-meter",
    classes: ["patd", "patd-meter"],
    window: { title: "Initiative Meter", icon: "fa-solid fa-bolt", resizable: true },
    position: { width: 520, height: "auto", top: 80, left: 120 },
    actions: {
      take: InitiativeMeterApp.#onTake,
      endTurn: InitiativeMeterApp.#onEndTurn,
      newRound: InitiativeMeterApp.#onNewRound,
      rebuild: InitiativeMeterApp.#onRebuild,
      setup: InitiativeMeterApp.#onSetup,
      resetFighters: InitiativeMeterApp.#onReset,
      openSheet: InitiativeMeterApp.#onOpenSheet,
      cycleSide: InitiativeMeterApp.#onCycleSide,
      declare: InitiativeMeterApp.#onDeclare
    }
  };
  static PARTS = { main: { template: `${SYS_PATH}/templates/apps/initiative-meter.hbs` } };

  async _prepareContext() {
    const combat = game.combat;
    const w = game.patd.weight();
    if (!combat) return { none: true, weight: w, isGM: game.user.isGM };
    const m = combat.meter;
    const slot = m?.slots?.[m.index] ?? null;
    const counts = Meter.sideCounts(combat);
    const fighters = combat.combatants.contents.filter(c => c.actor).map(c => ({
      id: c.id, name: c.name, img: c.img ?? c.actor.img, side: sideOf(c), sideLabel: SIDES[sideOf(c)],
      remaining: m ? Meter.remaining(combat, c) : c.actor.system.turnsPerRound,
      hp: c.actor.system.hp.value, hpMax: c.actor.system.hp.max,
      bars: c.actor.system.healthBars.value, barsMax: c.actor.system.healthBars.max,
      out: c.actor.system.takenOut, bleeding: c.actor.system.bleeding,
      stance: c.actor.activeStance?.name ?? "—",
      undeclared: combat.started && combat.round === 1 && !c.actor.system.declaredStance,
      canTake: !!slot && !slot.combatantId && sideOf(c) === slot.side && (m ? Meter.remaining(combat, c) > 0 : false) && (c.actor.isOwner || game.user.isGM),
      active: slot?.combatantId === c.id
    }));
    const activeC = slot?.combatantId ? combat.combatants.get(slot.combatantId) : null;
    return {
      combat, round: combat.round, started: combat.started, weight: w, isGM: game.user.isGM,
      slots: (m?.slots ?? []).map((s, i) => {
        const c = s.combatantId ? combat.combatants.get(s.combatantId) : null;
        return { ...s, label: SIDES[s.side], current: i === m.index, done: i < m.index, name: c?.name ?? "", img: c?.img ?? "" };
      }),
      slot, slotLabel: slot ? SIDES[slot.side] : "",
      fighters, counts: Object.entries(counts).map(([k, v]) => ({ label: SIDES[k], v })),
      active: activeC ? { name: activeC.name, owner: activeC.actor?.isOwner || game.user.isGM } : null,
      fightGoesOn: combat.getFlag(SYS, "fightGoesOn") ?? false,
      waitingDeclare: combat.started && combat.round === 1 && Meter.undeclared(combat).length > 0,
      undeclaredNames: Meter.undeclared(combat).map(c => c.name).join(", "),
      supers: Object.entries(m?.supers ?? {}).map(([k, v]) => ({ label: SIDES[k], v, max: w.supers })),
      params: combat.getFlag(SYS, "params") ?? {}
    };
  }

  static async #onTake(event, target) {
    const id = target.dataset.combatantId;
    if (game.user.isGM) return Meter.take(id, { override: event.shiftKey });
    socketRequest("meter", { op: "take", combatantId: id });
  }
  static async #onEndTurn() {
    const combat = game.combat; const slot = Meter.activeSlot(combat);
    const c = slot?.combatantId ? combat.combatants.get(slot.combatantId) : null;
    if (c?.actor?.sheet) {
      // Route through the sheet so End-Phase questions are asked
      const sheetCls = c.actor.sheet;
      return sheetCls.options.actions.endTurn.call(sheetCls, event);
    }
    if (game.user.isGM) return Meter.endTurn();
    socketRequest("meter", { op: "endTurn" });
  }
  static async #onDeclare() { if (game.user.isGM) await Meter.declareStances(game.combat); }

  static async #onNewRound() { if (game.user.isGM) await Meter.newRound(); }
  static async #onRebuild() { if (game.user.isGM) await Meter.buildRound(game.combat); }
  static async #onReset() {
    if (!game.user.isGM || !game.combat) return;
    const ok = await DialogV2.confirm({ window: { title: "Reset all fighters?" }, content: "<p>Restore Health Bars and HP; clear tokens, Shields, pools and once-per-fight uses for every combatant.</p>", rejectClose: false });
    if (ok) for (const c of game.combat.combatants) await c.actor?.resetForFight();
  }
  static #onOpenSheet(event, target) { game.combat?.combatants.get(target.dataset.combatantId)?.actor?.sheet.render(true); }
  static async #onCycleSide(event, target) {
    if (!game.user.isGM) return;
    const c = game.combat?.combatants.get(target.dataset.combatantId); if (!c) return;
    const order = Object.keys(SIDES); const next = order[(order.indexOf(sideOf(c)) + 1) % order.length];
    await c.setFlag(SYS, "side", next);
  }

  static async #onSetup() {
    if (!game.user.isGM) return;
    const combat = game.combat;
    const wKey = game.settings.get(SYS, "cinematicWeight");
    const p = combat?.getFlag(SYS, "params") ?? {};
    const sel = (name, arr, cur) => `<select name="${name}"><option value="">—</option>${arr.map(a => `<option ${a === cur ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>`;
    const content = `<div class="patd-form">
      <label>Cinematic Weight <select name="weight">${Object.entries(PATD.weights).map(([k, v]) => `<option value="${k}" ${k === wKey ? "selected" : ""}>${v.label} (${v.hp} HP, Heal ${v.heal}, Bleed ${v.bleed})</option>`).join("")}</select></label>
      ${combat ? `<label>Arena Parameter ${sel("arena", PATD.parameters.arena, p.arena)}</label>
      <label>Tilted (Heroes) ${sel("tiltHeroes", PATD.parameters.tilted, p.tiltHeroes)}</label>
      <label>Tilted (Enemies) ${sel("tiltEnemies", PATD.parameters.tilted, p.tiltEnemies)}</label>
      <label>Victory Parameter ${sel("victory", PATD.parameters.victory, p.victory ?? "Last One Standing")}</label>
      <label><input type="checkbox" name="fgo" ${combat.getFlag(SYS, "fightGoesOn") ? "checked" : ""}> The Fight Must Go On! (heal twice the Heal Value at the end of each Round)</label>
      <label><input type="checkbox" name="reset"> Reset every combatant to full HP and Health Bars for this fight</label>` : "<p>Start an encounter to set Battle Parameters.</p>"}
    </div>`;
    const res = await DialogV2.wait({ window: { title: "Fight Setup" }, classes: ["patd-dialog"], content,
      buttons: [{ action: "ok", label: "Save", default: true, callback: (e, b) => {
        const f = b.form.elements;
        return { weight: f.weight.value, arena: f.arena?.value, tiltHeroes: f.tiltHeroes?.value, tiltEnemies: f.tiltEnemies?.value, victory: f.victory?.value, fgo: f.fgo?.checked, reset: f.reset?.checked };
      } }], rejectClose: false });
    if (!res) return;
    await game.settings.set(SYS, "cinematicWeight", res.weight);
    if (combat) {
      await combat.update({ [`flags.${SYS}.params`]: { arena: res.arena, tiltHeroes: res.tiltHeroes, tiltEnemies: res.tiltEnemies, victory: res.victory }, [`flags.${SYS}.fightGoesOn`]: !!res.fgo && res.victory !== "Last One Standing" && res.victory !== "Outlast" });
      if (res.reset) for (const c of combat.combatants) await c.actor?.resetForFight();
    }
    for (const a of game.actors) a.prepareData();
    for (const a of game.actors) a.sheet?.rendered && a.sheet.render();
    ui.combat?.render();
    this.render();
  }
}
