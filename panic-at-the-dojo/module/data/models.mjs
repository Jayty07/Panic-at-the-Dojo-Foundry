import { PATD } from "../config.mjs";
const F = foundry.data.fields;

const int = (initial = 0, opts = {}) => new F.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const str = (initial = "") => new F.StringField({ required: true, blank: true, initial });
const html = () => new F.HTMLField({ required: true, blank: true, initial: "" });
const bool = (initial = false) => new F.BooleanField({ required: true, initial });

const actionSchema = () => new F.ArrayField(new F.SchemaField({
  cost: str(), name: str(), text: str(), source: str()
}));
const diceSchema = () => new F.ArrayField(new F.SchemaField({
  die: str("d6"), purple: bool(false)
}));

/* -------------------------------------------- */
/*  Actors                                      */
/* -------------------------------------------- */

class PatdActorBase extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const tokens = {};
    for (const k of [...PATD.basicTokens, ...PATD.statusTokens, ...PATD.uniqueTokens]) tokens[k] = int(0, { min: 0, max: PATD.tokenCap });
    return {
      level: int(1, { min: 1, max: 10 }),
      hp: new F.SchemaField({ value: int(20, { min: 0 }), bonus: int(0) }),
      healthBars: new F.SchemaField({ value: int(1, { min: 0 }), max: int(1, { min: 1, max: 6 }) }),
      shield: new F.SchemaField({ value: int(0, { min: 0, max: PATD.shieldCap }) }),
      armor: new F.SchemaField({
        sources: int(0, { min: 0 }),          // permanent Armor sources outside the stance (manual)
        temporary: bool(false),
        triggers: int(0, { min: 0 })          // triggers so far this turn
      }),
      tokens: new F.SchemaField(tokens),
      customTokens: new F.ArrayField(new F.SchemaField({ name: str("Token"), value: int(0, { min: 0, max: PATD.tokenCap }) })),
      challenge: str(""),                      // name of the Challenger whose token you hold
      pool: new F.ArrayField(new F.NumberField({ integer: true, min: 0 })),
      activeStance: str(""),
      declaredStance: bool(false),
      bleedRound: int(-1),
      bleedAbilityUsed: bool(false),
      superUsed: bool(false),
      outOfPlay: bool(false),
      motive: new F.SchemaField({ reason: str(), goal: str() }),
      biography: html()
    };
  }

  get weight() { return game.patd?.weight() ?? PATD.weights.middleweight; }

  prepareDerivedData() {
    const w = this.weight;
    const adv = this.advancement;
    this.bonusDie = adv?.die ?? null;
    this.levelHp = adv?.hp ?? 0;
    this.hp.max = Math.max(1, w.hp + this.levelHp + this.hp.bonus + this.firstBarBonus);
    this.hp.value = Math.min(this.hp.value, this.hp.max);
    this.healthBars.value = Math.min(this.healthBars.value, this.healthBars.max);
    this.shield.max = PATD.shieldCap;
    this.healValue = w.heal;
    this.bleedValue = w.bleed;
    this.bleeding = this.hp.value <= w.bleed;
    this.takenOut = (this.hp.value <= 0 && this.healthBars.value <= 1) || this.outOfPlay;
    this.turnsPerRound = this.healthBars.max;
  }

  get advancement() { return PATD.warriorAdvancement[this.level]; }

  /** Temple Build: first Health Bar gets bonus HP equal to the Bleed Value. */
  get firstBarBonus() {
    const actor = this.parent;
    const temple = actor?.items?.some(i => i.type === "build" && i.name.toLowerCase() === "temple");
    const onFirstBar = this.healthBars.value >= this.healthBars.max;
    return temple && onFirstBar ? this.weight.bleed : 0;
  }
}

export class HeroData extends PatdActorBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      heroType: new F.StringField({ required: true, initial: "focused", choices: Object.keys(PATD.heroTypes) }),
      xp: int(0, { min: 0 }),
      description: str(""),                    // two-word description skill
      franticAbility: str(""),                 // archetype id used for the Frantic Ability this turn
      lastFrantic: new F.SchemaField({ archetype: str(), style: str(), form: str() })
    };
  }
  get advancement() { return PATD.heroAdvancement[this.level]; }
  prepareDerivedData() {
    super.prepareDerivedData();
    this.benefits = PATD.heroBenefits[this.heroType]?.slice(0, this.level) ?? [];
    const next = PATD.heroAdvancement[this.level + 1];
    this.nextXp = next?.xp ?? null;
  }
}

export class WarriorData extends PatdActorBase {
  static defineSchema() { return { ...super.defineSchema(), threat: str("") }; }
}

export class BossData extends PatdActorBase {
  static defineSchema() {
    const s = super.defineSchema();
    s.healthBars = new F.SchemaField({ value: int(2, { min: 0 }), max: int(2, { min: 1, max: 6 }) });
    return s;
  }
}

export class StoogesData extends PatdActorBase {
  static defineSchema() {
    return { ...super.defineSchema(), members: new F.SchemaField({ value: int(6, { min: 0 }), max: int(6, { min: 1 }) }) };
  }
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

export class FormData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      altNames: new F.ArrayField(str()),
      keywords: new F.ArrayField(str()),
      dice: diceSchema(),
      abilities: new F.ArrayField(str()),
      actions: actionSchema(),
      skill: new F.SchemaField({ name: str(), text: str() }),
      description: html()
    };
  }
}

export class StyleData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      archetype: str(),
      keyword: str(),
      range: new F.SchemaField({ min: int(1, { min: 0 }), max: int(1, { min: 0 }) }),
      abilities: new F.ArrayField(str()),
      actions: actionSchema(),
      freestyle: bool(false),
      banned: str(""),
      dice: diceSchema(),
      recommended: str(""),
      description: html()
    };
  }
}

export class StanceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      formName: str(),
      formAlt: str(),
      styleName: str(),
      archetype: str(),
      freestyle: bool(false),
      keywords: new F.ArrayField(str()),
      dice: diceSchema(),
      range: new F.SchemaField({ min: int(1, { min: 0 }), max: int(1, { min: 0 }) }),
      armor: int(0, { min: 0 }),
      formAbilities: new F.ArrayField(str()),
      styleAbilities: new F.ArrayField(str()),
      actions: actionSchema(),
      notes: html()
    };
  }
}

export class ArchetypeData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      keywords: new F.ArrayField(str()),
      villain: bool(false),
      mode: new F.StringField({ required: true, initial: "fused", choices: ["focused", "fused", "frantic", "villain"] }),
      focused: new F.ArrayField(str()),
      fused: new F.ArrayField(str()),
      frantic: new F.ArrayField(str()),
      abilities: new F.ArrayField(str()),      // villain archetype abilities
      actions: actionSchema(),
      styles: new F.ArrayField(str()),
      notes: str(""),
      description: html()
    };
  }
  get activeAbilities() {
    if (this.villain) return this.abilities;
    return this[this.mode] ?? this.fused;
  }
}

export class BuildData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return { flavor: str(), abilities: new F.ArrayField(str()), description: html() }; }
}

export class SuperData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      archetype: str(),
      superType: new F.StringField({ required: true, initial: "alpha", choices: ["alpha", "delta"] }),
      effect: str(),
      description: html()
    };
  }
}

export class SkillData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return { text: str(), source: str(), description: html() }; }
}

export class ActionData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return { cost: str("1+"), text: str(), source: str("Custom"), description: html() }; }
}

export class PathData extends foundry.abstract.TypeDataModel {
  static defineSchema() { return { text: str(), description: html() }; }
}
