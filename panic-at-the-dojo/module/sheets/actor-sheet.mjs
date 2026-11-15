import { PATD, SYS, SYS_PATH } from "../config.mjs";
import { useAction, useSuper, damageDialog, esc, postCard } from "../chat.mjs";
import { rangeLabel, pickImage, buildStanceData } from "../helpers/stance.mjs";
import { loadContent, buildItem, archetypeItem, villainItem, pathItem } from "../content.mjs";
import { socketRequest } from "../socket.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

let CACHE_FORMS = null;
const DIE_SHAPE = { d4: "tri", d6: "sq", d8: "dia", d10: "kite", d12: "pent", preset: "hex" };

export class PatdActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["patd", "patd-sheet", "patd-actor"],
    position: { width: 860, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      patdTab: PatdActorSheet.#onTab,
      startTurn: PatdActorSheet.#onStartTurn,
      endTurn: PatdActorSheet.#onEndTurn,
      rollDice: PatdActorSheet.#onRollDice,
      stanceCheck: PatdActorSheet.#onStanceCheck,
      takeDamage: PatdActorSheet.#onTakeDamage,
      heal: PatdActorSheet.#onHeal,
      tokenPlus: PatdActorSheet.#onTokenPlus,
      tokenMinus: PatdActorSheet.#onTokenMinus,
      poolRemove: PatdActorSheet.#onPoolRemove,
      poolAdd: PatdActorSheet.#onPoolAdd,
      poolEmpty: PatdActorSheet.#onPoolEmpty,
      useAction: PatdActorSheet.#onUseAction,
      useSuper: PatdActorSheet.#onUseSuper,
      setStance: PatdActorSheet.#onSetStance,
      itemEdit: PatdActorSheet.#onItemEdit,
      itemDelete: PatdActorSheet.#onItemDelete,
      itemCreate: PatdActorSheet.#onItemCreate,
      itemPost: PatdActorSheet.#onItemPost,
      customTokenAdd: PatdActorSheet.#onCustomTokenAdd,
      customTokenDelete: PatdActorSheet.#onCustomTokenDelete,
      resetFight: PatdActorSheet.#onResetFight,
      toggleTempArmor: PatdActorSheet.#onToggleTempArmor,
      openBuilder: PatdActorSheet.#onOpenBuilder,
      toggleBasic: PatdActorSheet.#onToggleBasic,
      editPortrait: PatdActorSheet.#onEditPortrait
    }
  };

  static PARTS = {
    sheet: { template: `${SYS_PATH}/templates/actor/actor-sheet.hbs`, scrollable: [".patd-tab-body"] }
  };

  _activeTab = "fight";
  _showBasic = false;

  get title() { return this.actor.name; }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.actor, sys = actor.system;
    const w = game.patd.weight();
    const stance = actor.activeStance;
    CACHE_FORMS = (await loadContent()).forms;
    const items = actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const byType = (t) => items.filter(i => i.type === t);

    const dieView = (d) => ({ die: d.die, purple: d.purple, shape: DIE_SHAPE[/^d\d+$/.test(d.die) ? d.die : "preset"] ?? "hex", label: /^d\d+$/.test(d.die) ? d.die.toUpperCase() : d.die });
    const stanceView = (s) => ({
      id: s.id, name: s.name, img: s.img, active: s.id === sys.activeStance, sys: s.system,
      dice: s.system.dice.map(dieView), range: rangeLabel(s.system.range),
      actions: s.system.actions.map((a, i) => ({ ...a, idx: i, lines: a.text.split("\n") })),
      altOptions: (() => { const f = CACHE_FORMS?.find(x => x.name === s.system.formName); return f ? [f.name, ...f.altNames] : []; })(),
      isControl: s.system.formName === "Control"
    });

    const archetypes = byType("archetype").map(a => ({
      id: a.id, name: a.name, img: a.img, sys: a.system, villain: a.system.villain,
      modeLabel: a.system.villain ? "Villain" : (PATD.heroTypes[a.system.mode] ?? "Fused"),
      abilities: a.system.activeAbilities,
      actions: a.system.actions.map((x, i) => ({ ...x, idx: i, lines: x.text.split("\n") }))
    }));
    const frantic = actor.type === "hero" && sys.heroType === "frantic";
    const franticArch = frantic ? archetypes.find(a => a.id === sys.franticAbility) : null;
    const archetypeActions = archetypes
      .filter(a => !frantic || a.id === sys.franticAbility)
      .flatMap(a => a.actions.map(x => ({ ...x, itemId: a.id, source: a.name })));

    const tokenRow = (keys) => keys.map(k => ({ key: k, label: PATD.tokenLabels[k], icon: PATD.tokenIcons[k], value: sys.tokens[k] ?? 0, max: PATD.tokenCap }));
    const bars = Array.from({ length: sys.healthBars.max }, (_, i) => ({ filled: i < sys.healthBars.value, current: i === sys.healthBars.value - 1 }));
    const hpPct = Math.round(100 * sys.hp.value / Math.max(1, sys.hp.max));

    // Rules content for the Style / Form / Build / Archetype dropdowns
    const content = await loadContent();
    const owned = new Set(actor.archetypes.map(a => a.name));
    const archSorted = [...content.archetypes.filter(a => owned.has(a.name)), ...content.archetypes.filter(a => !owned.has(a.name))];
    const styleGroups = [
      ...archSorted.map(a => ({ label: `${a.name}${owned.has(a.name) ? " (yours)" : ""}`, options: a.styles.map(x => ({ value: x.name, label: `${x.name} Style (Range ${x.range}, ${x.keyword})` })) })),
      { label: "Freestyles (one max)", options: content.freestyles.map(x => ({ value: x.name, label: `${x.name} Freestyle (bans ${x.banned} Form)` })) }
    ];
    const formOptions = content.forms.map(f => ({ value: f.name, label: `${f.name} Form (${f.dice.map(d => d.die).join(" ")})` }));
    const stanceItems = byType("stance");
    const styleCount = {}, formCount = {};
    for (const s of stanceItems) { styleCount[s.system.styleName] = (styleCount[s.system.styleName] ?? 0) + 1; formCount[s.system.formName] = (formCount[s.system.formName] ?? 0) + 1; }
    const freeInUse = stanceItems.filter(s => s.system.freestyle);
    const stanceWarnings = (s) => {
      const w = [];
      if (!s.system.styleName || !s.system.formName) w.push("Pick a Style and a Form to build this Stance.");
      if (s.system.styleName && styleCount[s.system.styleName] > 1) w.push(`${s.system.styleName} Style is used in more than one Stance.`);
      if (s.system.formName && formCount[s.system.formName] > 1) w.push(`${s.system.formName} Form is used in more than one Stance.`);
      if (s.system.freestyle && freeInUse.length > 1) w.push("Only one Freestyle is allowed among all Stances.");
      for (const fs of freeInUse) { const f = content.freestyles.find(x => x.name === fs.system.styleName); if (f && formCount[`${f.banned}`]) w.push(`${f.name} Freestyle bans ${f.banned} Form.`); }
      return [...new Set(w)];
    };
    const buildOptions = content.builds.map(b => ({ value: b.name, label: b.name }));
    const archOptions = [
      { label: "Archetypes", options: content.archetypes.filter(a => !owned.has(a.name)).map(a => ({ value: `a:${a.name}`, label: `${a.name} (${a.keywords.join(" ")})` })) },
      { label: "Villain Archetypes", options: content.villains.filter(v => !owned.has(v.name)).map(v => ({ value: `v:${v.name}`, label: v.name })) }
    ];

    const bleedInfo = actor.type === "hero" ? PATD.bleedAbilities[sys.heroType] : null;
    const benefits = actor.type === "hero" ? PATD.heroBenefits[sys.heroType] : PATD.warriorBenefits;

    Object.assign(ctx, {
      actor, system: sys, cfg: PATD, weight: w, editable: this.isEditable, owner: actor.isOwner,
      isHero: actor.type === "hero", isBoss: actor.type === "boss", isStooges: actor.type === "stooges", isWarrior: actor.type === "warrior",
      typeLabel: game.i18n.localize(`TYPES.Actor.${actor.type}`),
      tab: this._activeTab, showBasic: this._showBasic,
      stance: stance ? stanceView(stance) : null,
      stances: byType("stance").map(stanceView),
      forms: byType("form"), styles: byType("style"),
      archetypes, archetypeActions, franticArch, frantic,
      build: actor.build, skills: byType("skill"), supers: byType("super").map(s => ({ id: s.id, name: s.name, img: s.img, sys: s.system, alpha: s.system.superType === "alpha" })),
      paths: byType("path"), customActions: byType("action").map(a => ({ id: a.id, name: a.name, cost: a.system.cost, text: a.system.text, lines: a.system.text.split("\n") })),
      basicActions: PATD.basicActions.map((a, i) => ({ ...a, idx: i, lines: a.text.split("\n") })),
      basicTokens: tokenRow(PATD.basicTokens), statusTokens: tokenRow(PATD.statusTokens), uniqueTokens: tokenRow(PATD.uniqueTokens),
      pool: sys.pool.map((n, i) => ({ n, i })), poolOver: sys.pool.length > PATD.poolCap,
      bars, hpPct, bleeding: sys.bleeding, dizzy: actor.statuses.has("dizzy"), takenOut: sys.takenOut,
      range: stance ? rangeLabel(actor.range) : "1",
      armorSources: actor.armorSources,
      bleedInfo, benefits: benefits?.map((b, i) => ({ level: i + 1, text: b, reached: i + 1 <= sys.level })),
      heroTypes: PATD.heroTypes, stanceOptions: byType("stance").map(s => ({ id: s.id, name: s.name })),
      builderAvailable: !!game.modules.get("patd-hero-builder")?.active,
      styleGroups, formOptions, buildOptions, archOptions,
      pathOptions: content.paths.map(p => ({ value: p.name, label: p.name })), path: byType("path")[0] ?? null,
      maxStances: actor.type === "boss" ? 3 : (sys.level >= 6 ? 2 : 1),
      advLine: actor.type === "hero" ? "" : PATD.warriorBenefits.slice(0, sys.level).filter(b => b !== "---").join(" · ")
    });
    ctx.stances = ctx.stances.map(s => ({ ...s, warnings: stanceWarnings(actor.items.get(s.id)) }));
    return ctx;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    if ((game.release?.generation ?? 12) >= 13) return; // core handles drops on v13+
    this.element.addEventListener("dragover", (ev) => ev.preventDefault());
    this.element.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      if (!this.isEditable) return;
      const TE = foundry.applications.ux?.TextEditor?.implementation ?? (typeof TextEditor !== "undefined" ? TextEditor : undefined);
      const data = TE.getDragEventData(ev);
      if (data?.type !== "Item") return;
      const item = await Item.implementation.fromDropData(data);
      if (!item || item.parent?.id === this.actor.id) return;
      await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    // Editing a pool number in place
    el.querySelectorAll("input.patd-pool-edit").forEach(inp => inp.addEventListener("change", async (ev) => {
      const pool = [...this.actor.system.pool];
      pool[Number(ev.currentTarget.dataset.index)] = Math.max(0, Number(ev.currentTarget.value) || 0);
      await this.actor.update({ "system.pool": pool });
    }));
    el.querySelectorAll("input.patd-custom-token").forEach(inp => inp.addEventListener("change", async (ev) => {
      const list = foundry.utils.deepClone(this.actor.system.customTokens);
      const i = Number(ev.currentTarget.dataset.index), f = ev.currentTarget.dataset.field;
      list[i][f] = f === "value" ? Math.max(0, Math.min(PATD.tokenCap, Number(ev.currentTarget.value) || 0)) : ev.currentTarget.value;
      await this.actor.update({ "system.customTokens": list });
    }));
    el.querySelectorAll("select.patd-stance-pick").forEach(sel => sel.addEventListener("change", (ev) => {
      ev.stopPropagation();
      const { itemId, field } = ev.currentTarget.dataset;
      return this.#rebuildStance(itemId, field, ev.currentTarget.value);
    }));
    el.querySelector("select.patd-build-pick")?.addEventListener("change", (ev) => { ev.stopPropagation(); return this.#setBuild(ev.currentTarget.value); });
    el.querySelector("select.patd-path-pick")?.addEventListener("change", (ev) => { ev.stopPropagation(); return this.#setPath(ev.currentTarget.value); });
    el.querySelector("select.patd-arch-add")?.addEventListener("change", (ev) => { ev.stopPropagation(); return this.#addArchetype(ev.currentTarget.value); });
    el.querySelectorAll("select.patd-archetype-mode").forEach(sel => sel.addEventListener("change", async (ev) => {
      const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
      await item?.update({ "system.mode": ev.currentTarget.value });
    }));
  }

  /* ------------------------------------------ */
  /*  Stance / Build / Archetype pickers        */
  /* ------------------------------------------ */

  /** Rebuild a Stance's stats (dice, range, Armor, abilities, Actions) from its Style + Form. */
  async #rebuildStance(itemId, field, value) {
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const c = await loadContent();
    const cur = { style: item.system.styleName, form: item.system.formName, alt: item.system.formAlt, control: item.system.control ?? "max" };
    cur[field] = value;
    if (field === "form") cur.alt = value;
    const form = c.forms.find(f => f.name === cur.form);
    let style = null, archetype = "", freestyle = false;
    for (const a of c.archetypes) { const s = a.styles.find(x => x.name === cur.style); if (s) { style = s; archetype = a.name; break; } }
    if (!style) { const f = c.freestyles.find(x => x.name === cur.style); if (f) { style = f; freestyle = true; } }
    if (!form || !style) {
      // Only one half chosen so far: remember it and wait for the other.
      return item.update({ name: `${cur.style || "?"} ${cur.alt || cur.form || "?"} Stance`, "system.styleName": cur.style, "system.formName": cur.form, "system.formAlt": cur.alt, "system.control": cur.control });
    }
    const data = buildStanceData(form, { ...style, archetype, freestyle }, { alt: cur.alt, control: cur.control });
    data.system.control = cur.control;
    data.system.notes = item.system.notes;
    await item.update({ name: data.name, system: data.system });
    // Warriors/Bosses gain the Fused Ability of their Style's Archetype automatically.
    if (this.actor.type !== "hero" && archetype && !this.actor.archetypes.some(a => a.name === archetype)) {
      const a = c.archetypes.find(x => x.name === archetype);
      if (a) await this.actor.createEmbeddedDocuments("Item", [archetypeItem(a, "fused")]);
    }
    if (!this.actor.system.activeStance) await this.actor.update({ "system.activeStance": item.id });
  }

  async #setBuild(name) {
    if (!name) return;
    const c = await loadContent();
    const b = c.builds.find(x => x.name === name);
    if (!b) return;
    const old = this.actor.items.filter(i => i.type === "build").map(i => i.id);
    if (old.length) await this.actor.deleteEmbeddedDocuments("Item", old);
    await this.actor.createEmbeddedDocuments("Item", [buildItem(b)]);
  }

  async #setPath(name) {
    const c = await loadContent();
    const old = this.actor.items.filter(i => i.type === "path").map(i => i.id);
    if (old.length) await this.actor.deleteEmbeddedDocuments("Item", old);
    const p = c.paths.find(x => x.name === name);
    if (p) await this.actor.createEmbeddedDocuments("Item", [pathItem(p)]);
  }

  async #addArchetype(value) {
    if (!value) return;
    const c = await loadContent();
    const [kind, name] = [value.slice(0, 1), value.slice(2)];
    let data = null;
    if (kind === "a") { const a = c.archetypes.find(x => x.name === name); if (a) data = archetypeItem(a, this.actor.type === "hero" ? this.actor.system.heroType : "fused"); }
    else { const v = c.villains.find(x => x.name === name); if (v) data = villainItem(v); }
    if (data) await this.actor.createEmbeddedDocuments("Item", [data]);
  }

  /* ------------------------------------------ */
  /*  Action handlers                           */
  /* ------------------------------------------ */

  static #onEditPortrait() { if (this.isEditable) pickImage(this.actor); }

  static #onTab(event, target) { this._activeTab = target.dataset.tab; this.render(); }
  static #onToggleBasic() { this._showBasic = !this._showBasic; this.render(); }

  static async #onStartTurn() { return startTurnDialog(this.actor); }

  static async #onEndTurn() {
    const actor = this.actor;
    const res = await DialogV2.wait({
      window: { title: `End Turn: ${actor.name}` }, classes: ["patd-dialog"],
      content: `<div class="patd-form">
        <p>End Phase: End abilities resolve first, then Traps, Burning, Challenge, Speed and Fatigue, then everyone empties their Action Pool.</p>
        <label><input type="checkbox" name="didNotMove"> I did not move from my starting space (discard up to 3 Fatigue)</label>
        <label><input type="checkbox" name="hitChallenger" ${actor.system.challenge ? "" : "disabled"}> I attempted to damage my Challenger (discard their Challenge)</label>
      </div>`,
      buttons: [{ action: "ok", label: "End Turn", icon: "fa-solid fa-hourglass-end", default: true, callback: (e, b) => ({ didNotMove: b.form.elements.didNotMove.checked, hitChallenger: b.form.elements.hitChallenger.checked }) }],
      rejectClose: false
    });
    if (!res) return;
    const notes = await actor.endOwnTurn(res);
    const ends = endAbilities(actor);
    await postCard({ actor, kind: "turn", title: "End of Turn", body: `${ends.length ? `<ul class="patd-reminders">${ends.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}<p class="patd-note">${notes.map(esc).join(" · ") || "No tokens to resolve."}</p>` });
    if (game.combat?.started) {
      if (game.user.isGM) await game.patd.meter.endTurn();
      else socketRequest("meter", { op: "endTurn" });
    } else await actor.endTurnCleanup();
  }

  static async #onRollDice() { return this.actor.rollActionDice(); }

  static async #onStanceCheck() { return stanceCheckDialog(this.actor); }

  static async #onTakeDamage() { return damageDialog(this.actor, 1); }

  static async #onHeal() {
    const n = await DialogV2.prompt({
      window: { title: "Heal" }, classes: ["patd-dialog"],
      content: `<label>Heal amount (Heal Value is ${this.actor.system.healValue}) <input type="number" name="n" value="${this.actor.system.healValue}" min="0" autofocus></label>`,
      ok: { label: "Heal", callback: (e, b) => Number(b.form.elements.n.value) }, rejectClose: false
    });
    if (n) await this.actor.heal(n);
  }

  static async #onTokenPlus(event, target) { await this.actor.modToken(target.dataset.key, event.shiftKey ? 3 : 1); }
  static async #onTokenMinus(event, target) { await this.actor.modToken(target.dataset.key, event.shiftKey ? -3 : -1); }

  static async #onPoolRemove(event, target) { await this.actor.spendNumbers([Number(target.dataset.index)]); }
  static async #onPoolAdd() {
    const n = await DialogV2.prompt({
      window: { title: "Add a number" }, classes: ["patd-dialog"],
      content: `<label>Number <input type="number" name="n" value="3" min="1" max="12" autofocus></label>`,
      ok: { label: "Add", callback: (e, b) => Number(b.form.elements.n.value) }, rejectClose: false
    });
    if (n) await this.actor.addToPool([n]);
  }
  static async #onPoolEmpty() { await this.actor.emptyPool(); }

  static async #onUseAction(event, target) {
    const { group, idx, itemId } = target.dataset;
    let action, source = "";
    if (group === "basic") { action = PATD.basicActions[Number(idx)]; source = "Basic Action"; }
    else if (group === "stance") { const s = this.actor.activeStance; action = s?.system.actions[Number(idx)]; source = action?.source ?? s?.name; }
    else if (group === "archetype") { const a = this.actor.items.get(itemId); action = a?.system.actions[Number(idx)]; source = `${a?.name} Archetype`; }
    else if (group === "custom") { const a = this.actor.items.get(itemId); action = { cost: a.system.cost, name: a.name, text: a.system.text }; source = a.system.source; }
    if (!action) return;
    if (this.actor.statuses.has("dizzy")) return ui.notifications.warn(`${this.actor.name} is Dizzy and cannot perform Actions.`);
    return useAction(this.actor, action, { sourceLabel: source });
  }

  static async #onUseSuper(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) return useSuper(this.actor, item);
  }

  static async #onSetStance(event, target) {
    if (this.actor.statuses.has("dizzy")) return ui.notifications.warn("A Dizzy character cannot enter a new Stance until their next turn.");
    await this.actor.update({ "system.activeStance": target.dataset.itemId });
  }

  static #onItemEdit(event, target) { this.actor.items.get(target.closest("[data-item-id]").dataset.itemId)?.sheet.render(true); }
  static async #onItemDelete(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const ok = await DialogV2.confirm({ window: { title: `Delete ${item.name}?` }, content: `<p>Remove <b>${esc(item.name)}</b> from ${esc(this.actor.name)}?</p>`, rejectClose: false });
    if (ok) await item.delete();
  }
  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const name = game.i18n.format("DOCUMENT.New", { type: game.i18n.localize(`TYPES.Item.${type}`) });
    if (type === "stance") {
      // Blank Stance: choose its Style and Form with the dropdowns on the card.
      await this.actor.createEmbeddedDocuments("Item", [{ name: "New Stance", type, system: { styleName: "", formName: "", formAlt: "" } }]);
      this._activeTab = "stances";
      return this.render();
    }
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
    item?.sheet.render(true);
  }
  static async #onItemPost(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) return item.toChat();
  }
  static async #onCustomTokenAdd() {
    const list = [...this.actor.system.customTokens, { name: "Unique Token", value: 0 }];
    await this.actor.update({ "system.customTokens": list });
  }
  static async #onCustomTokenDelete(event, target) {
    const list = this.actor.system.customTokens.filter((_, i) => i !== Number(target.dataset.index));
    await this.actor.update({ "system.customTokens": list });
  }
  static async #onResetFight() {
    const ok = await DialogV2.confirm({ window: { title: "Reset for a new fight?" }, content: "<p>Restore all Health Bars and HP, clear tokens, Shield, Action Pool and once-per-fight uses.</p>", rejectClose: false });
    if (ok) await this.actor.resetForFight();
  }
  static async #onToggleTempArmor() { await this.actor.update({ "system.armor.temporary": !this.actor.system.armor.temporary }); }
  static #onOpenBuilder() { game.modules.get("patd-hero-builder")?.api?.open(this.actor); }
}

/* -------------------------------------------- */
/*  Compact NPC sheet (Warriors, Bosses, Stooges)*/
/* -------------------------------------------- */

export class PatdNpcSheet extends PatdActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["patd-npc"],
    position: { width: 640, height: 760 },
    actions: { toggleSection: PatdNpcSheet.#onToggleSection }
  };
  static PARTS = {
    sheet: { template: `${SYS_PATH}/templates/actor/npc-sheet.hbs`, scrollable: [".patd-npc-body"] }
  };
  _open = { stances: true, actions: true, traits: true };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.open = this._open;
    ctx.canAddStance = ctx.stances.length < ctx.maxStances;
    return ctx;
  }

  static #onToggleSection(event, target) {
    const k = target.dataset.section;
    this._open[k] = !this._open[k];
    this.render();
  }
}

/* -------------------------------------------- */
/*  Reminders                                   */
/* -------------------------------------------- */

function abilityPool(actor) {
  const out = [];
  const s = actor.activeStance;
  if (s && !actor.statuses.has("dizzy")) {
    for (const a of s.system.formAbilities) out.push({ src: `${s.system.formName} Form`, text: a });
    for (const a of s.system.styleAbilities) out.push({ src: `${s.system.styleName} Style`, text: a });
  }
  const frantic = actor.type === "hero" && actor.system.heroType === "frantic";
  for (const a of actor.archetypes) {
    if (frantic && a.system.mode === "frantic" && a.id !== actor.system.franticAbility) continue;
    for (const t of a.system.activeAbilities) out.push({ src: a.name, text: t });
  }
  const b = actor.build; if (b) for (const t of b.system.abilities) out.push({ src: b.name, text: t });
  return out;
}
export function startAbilities(actor) {
  return abilityPool(actor).filter(a => /^At the start (of|and end of) (your|each|every|this) turn|^At the start of each enemy turn/i.test(a.text)).map(a => `${a.src}: ${a.text}`);
}
export function endAbilities(actor) {
  return abilityPool(actor).filter(a => /^At the end of (your|each|every) turn|^At the start and end of your turn/i.test(a.text)).map(a => `${a.src}: ${a.text}`);
}

/* -------------------------------------------- */
/*  Start of turn                               */
/* -------------------------------------------- */

export async function startTurnDialog(actor) {
  const sys = actor.system;
  const stances = actor.stances;
  const isHero = actor.type === "hero";
  const frantic = isHero && sys.heroType === "frantic";
  const canBleed = isHero && sys.bleeding && !sys.bleedAbilityUsed && sys.hp.value > 0;
  // Rulebook p. 66: skip Stance Select on your first turn of the first Round (multi-turn Bosses may change on their second).
  const firstTurn = !!game.combat?.started && game.combat.round === 1 && sys.declaredStance && game.patd.meter.turnsTaken(actor) <= 1;
  const allies = (game.combat?.combatants.contents ?? []).map(c => c.actor).filter(a => a && a.id !== actor.id && !a.system.takenOut);
  const out = sys.takenOut;
  const archs = actor.archetypes.filter(a => a.system.mode === "frantic");
  const last = sys.lastFrantic ?? {};
  const opt = (v, l, sel, dis) => `<option value="${v}" ${sel ? "selected" : ""} ${dis ? "disabled" : ""}>${esc(l)}</option>`;
  const content = `<div class="patd-form patd-start">
    <label>Stance ${firstTurn ? "<em>(declared at Combat Start, locked for your first turn)</em>" : ""}
      <select name="stance" ${firstTurn ? "disabled" : ""}>${stances.map(s => {
        const blocked = frantic && (s.system.styleName === last.style || s.system.formName === last.form);
        return opt(s.id, `${s.name}${blocked ? " (used last turn)" : ""}`, s.id === sys.activeStance, false);
      }).join("")}</select></label>
    ${frantic ? `<label>Frantic Ability <select name="frantic">${archs.map(a => opt(a.id, `Frantic ${a.name}${a.id === last.archetype ? " (used last turn)" : ""}`, a.id === sys.franticAbility, false)).join("")}</select></label>
      <p class="patd-note">${esc(PATD.franticVersatility)}</p>` : ""}
    ${canBleed ? `<fieldset class="patd-bleed"><legend>${esc(PATD.bleedAbilities[sys.heroType].name)} (once per fight)</legend>
      <label><input type="checkbox" name="bleed"> Use it now</label>
      ${frantic ? `<label><input type="radio" name="franticBleed" value="d10" checked> Add d10</label><label><input type="radio" name="franticBleed" value="d6d4"> Add d6 + d4</label>` : ""}
      <p class="patd-note">${esc(PATD.bleedAbilities[sys.heroType].text)}</p></fieldset>` : ""}
    ${out ? `<label>Heroic Spirit: give your dice to <select name="spirit">${allies.map(a => opt(a.id, a.name)).join("")}</select></label>` : ""}
    <label><input type="checkbox" name="tooSlow"> Too Slow (discard the lowest die before rolling)</label>
    <label>Extra dice (comma separated, e.g. d6,d4) <input type="text" name="extra" value=""></label>
  </div>`;
  const res = await DialogV2.wait({
    window: { title: `Start Turn: ${actor.name}` }, classes: ["patd-dialog"], content,
    buttons: [{ action: "go", label: "Roll Action Dice", icon: "fa-solid fa-dice", default: true, callback: (e, b) => {
      const f = b.form.elements;
      return {
        stance: f.stance?.value, frantic: f.frantic?.value, bleed: f.bleed?.checked,
        franticBleed: b.form.querySelector("input[name=franticBleed]:checked")?.value,
        spirit: f.spirit?.value, tooSlow: f.tooSlow.checked,
        extra: (f.extra.value || "").split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(s => /^d\d+$|^\d+$/.test(s))
      };
    } }],
    rejectClose: false
  });
  if (!res) return;
  const updates = {};
  if (res.stance && !firstTurn) updates["system.activeStance"] = res.stance;
  if (frantic) {
    updates["system.franticAbility"] = res.frantic ?? "";
    const st = actor.items.get(res.stance ?? sys.activeStance);
    updates["system.lastFrantic"] = { archetype: res.frantic ?? "", style: st?.system.styleName ?? "", form: st?.system.formName ?? "" };
  }
  await actor.update(updates);

  const extra = [...res.extra];
  let focusedBleed = false;
  if (res.bleed) {
    await actor.update({ "system.bleedAbilityUsed": true });
    if (sys.heroType === "focused") focusedBleed = true;
    if (sys.heroType === "frantic") extra.push(...(res.franticBleed === "d6d4" ? ["d6", "d4"] : ["d10"]));
    if (sys.heroType === "fused") {
      await actor.heal(null, { silent: true });
      await actor.modToken("power", 2); await actor.modToken("iron", 2);
      await actor.gainShield(2);
    }
  }
  const reminders = startAbilities(actor);
  await postCard({
    actor, kind: "turn", title: "Start of Turn", subtitle: actor.activeStance?.name ?? "No Stance",
    body: `${res.bleed ? `<div class="patd-callout bleed"><b>${esc(PATD.bleedAbilities[sys.heroType].name)}!</b>${sys.heroType === "fused" ? " Healed, +2 Power, +2 Iron, Shield 2. You may Move 2." : ""}</div>` : ""}
      ${reminders.length ? `<ul class="patd-reminders">${reminders.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : "<p class=\"patd-note\">No start-of-turn Abilities.</p>"}`
  });
  const recipient = res.spirit ? game.actors.get(res.spirit) ?? allies.find(a => a.id === res.spirit) : null;
  await actor.rollActionDice({ extra, focusedBleed, recipient, dropLowest: res.tooSlow, label: recipient ? "Heroic Spirit" : "Action Dice" });
}

/* -------------------------------------------- */
/*  Stance Checks (Tests and Contests)          */
/* -------------------------------------------- */

export async function stanceCheckDialog(actor) {
  const stances = actor.stances;
  const opt = (v, l) => `<option value="${v}">${esc(l)}</option>`;
  const content = `<div class="patd-form">
    <label>Stance <select name="stance">${stances.map(s => opt(s.id, s.name)).join("")}</select></label>
    <label>Test / Contest <select name="test"><optgroup label="Tests">${Object.entries(PATD.tests).map(([k, v]) => opt(`t:${k}`, v.split(":")[0])).join("")}</optgroup>
      <optgroup label="Contests">${Object.entries(PATD.contests).map(([k, v]) => opt(`c:${k}`, `${v.split(":")[0]} Contest`)).join("")}</optgroup></select></label>
    <fieldset><legend>Skill bonuses (one different bonus per applicable Skill)</legend>
      ${PATD.stanceCheckBonuses.map(b => `<label><input type="checkbox" name="b_${b.id}"> ${esc(b.label)}</label>`).join("")}
    </fieldset>
  </div>`;
  const res = await DialogV2.wait({
    window: { title: `Stance Check: ${actor.name}` }, classes: ["patd-dialog"], content,
    buttons: [{ action: "go", label: "Enter Stance & Roll", icon: "fa-solid fa-dice", default: true, callback: (e, b) => {
      const f = b.form.elements;
      return { stance: f.stance.value, test: f.test.value, bonuses: PATD.stanceCheckBonuses.filter(x => f[`b_${x.id}`].checked) };
    } }],
    rejectClose: false
  });
  if (!res) return;
  await actor.update({ "system.activeStance": res.stance, "system.pool": [] });
  const extra = res.bonuses.flatMap(b => b.dice ?? []);
  const [kind, key] = res.test.split(":");
  const text = kind === "t" ? PATD.tests[key] : PATD.contests[key];
  await postCard({
    actor, kind: "check", title: "Stance Check", subtitle: text.split(":")[0],
    body: `<p>${esc(text)}</p>${res.bonuses.length ? `<p class="patd-note">Skill bonuses: ${res.bonuses.map(b => esc(b.label)).join("; ")}</p>` : ""}`
  });
  await actor.rollActionDice({ extra, label: "Stance Check Dice" });
  if (res.bonuses.some(b => b.id === "tokens")) ui.notifications.info("Gain 3 Basic tokens of your choice using the token counters.");
}
