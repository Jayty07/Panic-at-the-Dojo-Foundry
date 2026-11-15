import { PATD, SYS } from "../config.mjs";
import { postCard, esc } from "../chat.mjs";
import { FX } from "../integrations/sequencer.mjs";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class PatdActor extends Actor {

  /* ------------------------------------------ */
  /*  Creation defaults                         */
  /* ------------------------------------------ */

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const w = game.patd.weight();
    const changes = {
      "system.hp.value": w.hp,
      "prototypeToken.bar1": { attribute: "hp" },
      "prototypeToken.bar2": { attribute: "healthBars" },
      "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.HOVER
    };
    if (this.type === "hero") Object.assign(changes, { "prototypeToken.actorLink": true, "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY });
    else changes["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.HOSTILE;
    if (this.type === "stooges") changes["prototypeToken.actorLink"] = true; // all Stooge tokens share one unit
    if (this.type === "boss") changes["system.healthBars"] = { value: 2, max: 2 };
    const bars = game.patd.barbrawl?.defaultBars(this.type);
    if (bars) changes["prototypeToken.flags.barbrawl.resourceBars"] = bars;
    this.updateSource(changes);
  }

  /* ------------------------------------------ */
  /*  Accessors                                 */
  /* ------------------------------------------ */

  get stances() { return this.items.filter(i => i.type === "stance"); }
  get activeStance() { return this.items.get(this.system.activeStance) ?? null; }
  get archetypes() { return this.items.filter(i => i.type === "archetype"); }
  get build() { return this.items.find(i => i.type === "build") ?? null; }

  get range() {
    const s = this.activeStance;
    if (!s || this.statuses?.has("dizzy")) return { min: 1, max: 1 };
    return s.system.range;
  }

  /** Number of Armor sources currently active. */
  get armorSources() {
    let n = this.system.armor.sources;
    const s = this.activeStance;
    if (s && !this.statuses?.has("dizzy")) n += s.system.armor;
    return n;
  }

  get keepsSpeed() {
    const s = this.activeStance;
    return s?.system.formName === "Shadow" || s?.system.formName === "Silent";
  }

  /* ------------------------------------------ */
  /*  Tokens                                    */
  /* ------------------------------------------ */

  async modToken(key, delta, { silent = false } = {}) {
    const cur = this.system.tokens[key] ?? 0;
    let gain = delta;
    // Iron/Power Form & Mountainous: replace half of gained Speed tokens (rounded down)
    if (key === "speed" && delta > 0) {
      const form = this.activeStance?.system.formName;
      const style = this.activeStance?.system.styleName;
      const swap = (form === "Iron" || style === "Mountainous") ? "iron" : (form === "Power") ? "power" : null;
      if (swap) {
        const half = Math.floor(delta / 2);
        gain = delta - half;
        if (half) await this.modToken(swap, half, { silent: true });
      }
    }
    const next = clamp(cur + gain, 0, PATD.tokenCap);
    const d = next - cur;
    await this.update({ [`system.tokens.${key}`]: next }, d ? { [SYS]: { fx: { text: `${d > 0 ? "+" : ""}${d} ${PATD.tokenLabels[key] ?? key}`, color: PATD.statusTokens.includes(key) ? "#ffb347" : "#ffe066" } } } : {});
    return next - cur;
  }

  async setChallenge(name) { return this.update({ "system.challenge": name ?? "" }, name ? { [SYS]: { fx: { text: `Challenged by ${name}`, color: "#ffd23f" } } } : {}); }

  async gainShield(value) {
    const cur = this.system.shield.value;
    let next;
    if (cur > 0) {
      const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: "New Shield" },
        content: `<p>You already hold <b>Shield ${cur}</b>. Gaining <b>Shield ${value}</b>:</p>`,
        buttons: [
          { action: "replace", label: `Replace (Shield ${Math.min(value, PATD.shieldCap)})`, default: value > cur + 1 },
          { action: "increase", label: `Increase by 1 (Shield ${Math.min(cur + 1, PATD.shieldCap)})`, default: value <= cur + 1 }
        ]
      }).catch(() => "replace");
      next = choice === "increase" ? cur + 1 : value;
    } else next = value;
    next = clamp(next, 0, PATD.shieldCap);
    await this.update({ "system.shield.value": next }, { [SYS]: { fx: { text: `Shield ${next}`, color: "#28d0ff" } } });
    FX.shield(this, next);
  }

  /* ------------------------------------------ */
  /*  Action Pool                               */
  /* ------------------------------------------ */

  async addToPool(numbers) {
    const pool = [...this.system.pool, ...numbers];
    await this.update({ "system.pool": pool });
    if (pool.length > PATD.poolCap) ui.notifications.warn(`${this.name} holds ${pool.length} numbers. The Number Cap is 10: discard down to 10.`);
  }

  async spendNumbers(indices) {
    const pool = this.system.pool.filter((_, i) => !indices.includes(i));
    return this.update({ "system.pool": pool });
  }

  async emptyPool() { return this.update({ "system.pool": [] }); }

  /* ------------------------------------------ */
  /*  Action Dice                               */
  /* ------------------------------------------ */

  /**
   * Roll the Action Dice of the active stance (plus bonus die and extras).
   * @param {object} opts
   * @param {string[]} [opts.extra]        extra dice like "d10"
   * @param {boolean} [opts.focusedBleed]  reroll values of 2 or less
   * @param {PatdActor} [opts.recipient]   Heroic Spirit recipient
   * @param {boolean} [opts.dropLowest]    Too Slow
   */
  async rollActionDice({ extra = [], focusedBleed = false, recipient = null, dropLowest = false, label = "Action Dice" } = {}) {
    const stance = this.activeStance;
    let dice = stance ? stance.system.dice.map(d => d.die) : [];
    if (!stance) ui.notifications.warn(`${this.name} has no Stance: rolling no stance dice.`);
    if (this.system.bonusDie) dice.push(this.system.bonusDie);
    dice.push(...extra);
    if (dropLowest && dice.length) {
      const size = d => /^d(\d+)$/.test(d) ? Number(d.slice(1)) : Number(d);
      const idx = dice.reduce((m, d, i) => size(d) < size(dice[m]) ? i : m, 0);
      dice.splice(idx, 1);
    }
    const fixed = dice.filter(d => !/^d\d+$/.test(d)).map(Number);
    const rolled = dice.filter(d => /^d\d+$/.test(d));
    let results = [];
    let roll = null;
    if (rolled.length) {
      // Focused Bleed: recursive reroll until no die is below 3
      const formula = rolled.map(d => `1${d}${focusedBleed ? "rr<=2" : ""}`).join(" + ");
      roll = await new Roll(formula).evaluate();
      results = roll.dice.map(d => d.total);
    }
    const preset = fixed.map(n => focusedBleed ? Math.max(3, n) : n);
    const numbers = [...preset, ...results];
    const target = recipient ?? this;
    await target.addToPool(numbers);

    const chips = [
      ...preset.map(n => ({ n, die: "preset" })),
      ...results.map((n, i) => ({ n, die: rolled[i] }))
    ];
    const by = recipient ? `<p class="patd-note">Heroic Spirit: added to <b>${esc(recipient.name)}</b>'s Action Pool.</p>` : "";
    await postCard({
      actor: this,
      kind: "roll",
      title: label,
      subtitle: stance ? stance.name : "No Stance",
      body: `<div class="patd-dice-row">${chips.map(c => `<span class="patd-die ${c.die === "preset" ? "preset" : ""}" title="${c.die}">${c.n}</span>`).join("")}</div>${by}`,
      rolls: roll ? [roll] : []
    });
    return numbers;
  }

  /* ------------------------------------------ */
  /*  Damage & Healing                          */
  /* ------------------------------------------ */

  /**
   * Apply damage following WEPIA (Weakness/Effects/Power were applied by the attacker).
   * @param {number} amount
   * @param {object} o
   * @param {"action"|"burning"|"fall"|"trap"|"super"|"cost"} [o.source]
   * @param {boolean} [o.useIron]   spend 1 Iron token to reduce by 1
   * @param {boolean} [o.useShield] Shield blocks damage
   * @param {boolean} [o.unblockableArmor]
   * @param {string}  [o.attackerName]
   */
  async applyDamage(amount, { source = "action", useIron = false, useShield = false, unblockableArmor = false, attackerName = "" } = {}) {
    const sys = this.system;
    if (this.statuses?.has("dizzy") && source !== "cost") {
      ui.notifications.info(`${this.name} is Dizzy and cannot take damage this turn.`);
      return 0;
    }
    const log = [];
    let dmg = Math.max(0, amount);
    const updates = {};
    if (source === "cost") {
      log.push(`Pays ${dmg} HP`);
    } else {
      if (useIron && source === "action" && sys.tokens.iron > 0 && dmg > 0) {
        dmg -= 1; updates["system.tokens.iron"] = sys.tokens.iron - 1; log.push("Iron −1");
      }
      if (useShield && sys.shield.value > 0 && dmg > 0 && source !== "fall" && source !== "trap") {
        const absorbed = Math.min(sys.shield.value, dmg);
        dmg -= absorbed; updates["system.shield.value"] = sys.shield.value - absorbed;
        log.push(absorbed === sys.shield.value ? `Shield breaks (−${absorbed})` : `Shield −${absorbed}`);
      }
      if (dmg > 0 && !unblockableArmor) {
        const sources = this.armorSources;
        const used = sys.armor.triggers;
        if (used < sources) {
          const block = used === 0 ? 3 : used === 1 ? 2 : 1;
          dmg = Math.max(0, dmg - block); updates["system.armor.triggers"] = used + 1; log.push(`Armor −${block}`);
        } else if (sys.armor.temporary) {
          const block = used === 0 ? 3 : used === 1 ? 2 : 1;
          dmg = Math.max(0, dmg - block); updates["system.armor.temporary"] = false; log.push(`Temp Armor −${block}`);
        }
      }
    }
    const before = sys.hp.value;
    let hp = Math.max(0, before - dmg);
    let barBroke = false, takenOut = false;
    if (dmg > 0 && hp <= 0) {
      if (sys.healthBars.value > 1) {
        barBroke = true;
        updates["system.healthBars.value"] = sys.healthBars.value - 1;
        hp = 0; // set to new bar max after update
      } else takenOut = true;
    }
    updates["system.hp.value"] = hp;
    await this.update(updates, { [SYS]: { fx: { text: source === "cost" ? `−${dmg} HP` : (dmg > 0 ? `−${dmg}` : "BLOCKED"), color: dmg > 0 ? "#ff4d4d" : "#28d0ff" } } });

    // Bleed check
    let bled = false;
    const roundNow = game.combat?.round ?? 0;
    if (dmg > 0 && source !== "cost" && !barBroke && hp <= this.system.bleedValue && sys.bleedRound !== roundNow) {
      bled = true;
      await this.update({ "system.bleedRound": roundNow });
    }

    if (barBroke) {
      await this.update({ "system.hp.value": this.system.hp.max });
      await this.toggleStatusEffect("dizzy", { active: true });
    }
    if (takenOut) {
      await this.toggleStatusEffect("dizzy", { active: true });
      await this.toggleStatusEffect("takenOut", { active: true });
    }

    FX.damage(this, dmg, { barBroke, takenOut, bled });

    const extra = [];
    if (bled) {
      const b = this.build;
      extra.push(`<div class="patd-callout bleed"><b>${esc(this.name)} Bleeds!</b>${b ? `<br><i>${esc(b.name)}:</i> ${b.system.abilities.map(esc).join(" ")}` : ""}</div>`);
    }
    if (barBroke) extra.push(`<div class="patd-callout dizzy"><b>Health Bar broken!</b> ${esc(this.name)} is Dizzy until the end of the turn and exits their Stance. Extra damage is lost.</div>`);
    if (takenOut) extra.push(`<div class="patd-callout out"><b>${esc(this.name)} is Taken Out!</b> They still take turns using Heroic Spirit.</div>`);
    await postCard({
      actor: this, kind: "damage", title: source === "cost" ? "Pays HP" : "Takes Damage",
      subtitle: attackerName ? `from ${attackerName}` : "",
      body: `<div class="patd-big-number dmg">−${dmg}</div><p class="patd-note">${log.join(" · ") || "No reductions"} (base ${amount})</p>${extra.join("")}`
    });
    return dmg;
  }

  async heal(amount = null, { silent = false } = {}) {
    const n = amount ?? this.system.healValue;
    const before = this.system.hp.value;
    const hp = Math.min(this.system.hp.max, before + n);
    const updates = { "system.hp.value": hp };
    await this.update(updates, { [SYS]: { fx: { text: `+${hp - before}`, color: "#54fe92" } } });
    if (before <= 0 && hp > 0 && this.statuses?.has("takenOut")) await this.toggleStatusEffect("takenOut", { active: false });
    FX.heal(this, hp - before);
    if (!silent) await postCard({ actor: this, kind: "heal", title: "Heals", body: `<div class="patd-big-number heal">+${hp - before}</div>` });
    return hp - before;
  }

  /* ------------------------------------------ */
  /*  Turn structure                            */
  /* ------------------------------------------ */

  /** Phase 8 for the active character. */
  async endOwnTurn({ didNotMove = false, hitChallenger = false } = {}) {
    const sys = this.system;
    const notes = [];
    const burning = sys.tokens.burning;
    const immune = this.activeStance?.system.styleName === "Phoenix";
    if (burning > 0) {
      if (!immune) {
        // Burning eats through Shield first; Iron cannot reduce it; Armor can.
        let dmg = burning;
        if (sys.shield.value > 0) { const a = Math.min(sys.shield.value, dmg); dmg -= a; await this.update({ "system.shield.value": sys.shield.value - a }); notes.push(`Shield absorbed ${a}`); }
        if (dmg > 0) await this.applyDamage(dmg, { source: "burning" });
      } else notes.push("Phoenix: immune to Burning damage");
      await this.update({ "system.tokens.burning": burning - Math.ceil(burning / 2) });
      notes.push(`Burning ${burning} → ${burning - Math.ceil(burning / 2)}`);
    }
    if (hitChallenger && sys.challenge) { await this.update({ "system.challenge": "" }); notes.push("Discarded Challenge"); }
    if (didNotMove && sys.tokens.fatigue > 0) { const f = Math.max(0, sys.tokens.fatigue - 3); await this.update({ "system.tokens.fatigue": f }); notes.push(`Fatigue → ${f}`); }
    return notes;
  }

  /** Cleanup that applies to every character at the end of every turn. */
  async endTurnCleanup() {
    const sys = this.system;
    const updates = { "system.pool": [], "system.armor.triggers": 0 };
    if (!this.keepsSpeed) {
      const floor = this.activeStance?.system.styleName === "Scrambling" ? Math.min(2, sys.tokens.speed) : 0;
      updates["system.tokens.speed"] = Math.max(floor, sys.tokens.speed - 3);
    }
    await this.update(updates);
    if (this.statuses?.has("dizzy")) {
      await this.toggleStatusEffect("dizzy", { active: false });
      if (this.system.activeStance) await this.update({ "system.activeStance": "" });
    }
  }

  async resetForFight({ full = true } = {}) {
    const tokens = Object.fromEntries(Object.keys(this.system.tokens).map(k => [k, 0]));
    const updates = {
      "system.tokens": tokens, "system.pool": [], "system.shield.value": 0, "system.challenge": "",
      "system.armor.temporary": false, "system.armor.triggers": 0,
      "system.bleedRound": -1, "system.bleedAbilityUsed": false, "system.superUsed": false,
      "system.outOfPlay": false, "system.declaredStance": false
    };
    if (full) { updates["system.healthBars.value"] = this.system.healthBars.max; }
    await this.update(updates);
    if (full) await this.update({ "system.hp.value": this.system.hp.max });
    for (const s of ["dizzy", "takenOut", "outOfPlay"]) if (this.statuses?.has(s)) await this.toggleStatusEffect(s, { active: false });
  }
}
