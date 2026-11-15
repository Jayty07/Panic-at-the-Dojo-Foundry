/**
 * Panic at the Dojo — Hero Builder.
 * Walks through the Hero Creation Checklist and creates (or rebuilds) a Hero actor.
 */
const MOD = "patd-hero-builder";
const SYS = "panic-at-the-dojo";
const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

const STEPS = [
  { id: "basics", label: "Hero Type" },
  { id: "archetypes", label: "Archetypes" },
  { id: "stances", label: "Stances" },
  { id: "build", label: "Build" },
  { id: "skills", label: "Skills" },
  { id: "supers", label: "Super Moves" },
  { id: "review", label: "Review" }
];

const TYPE_INFO = {
  focused: { label: "Focused", blurb: "One Archetype. A powerful Focused Ability that is always on, and three Stances using Styles from that Archetype.", archetypes: 1 },
  fused: { label: "Fused", blurb: "Two Archetypes. Both Fused Abilities are always on. At least one Style from each Archetype.", archetypes: 2 },
  frantic: { label: "Frantic", blurb: "Three Archetypes, one Style from each and any three Forms. You assemble a new Stance every turn. Not recommended for your first Hero.", archetypes: 3 }
};

/** Stances allowed by level (Focused/Fused). */
function stanceSlots(type, level) {
  if (type === "frantic") return 3;
  let n = 3;
  if (level >= 4) n++; if (level >= 6) n++; if (level >= 8) n++;
  if (type === "fused" && level >= 10) n++;
  return n;
}
const superSlots = (level) => level >= 6 ? 2 : level >= 2 ? 1 : 0;
const extraArchetypeSlots = (type, level) => type === "focused" ? (level >= 5 ? 1 : 0) : (level >= 9 ? 2 : level >= 5 ? 1 : 0);

class HeroBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "patd-hero-builder",
    tag: "form",
    classes: ["patd", "patd-builder"],
    window: { title: "PATDHB.Title", icon: "fa-solid fa-wand-magic-sparkles", resizable: true },
    position: { width: 980, height: 820 },
    form: { handler: HeroBuilder.#onChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      next: HeroBuilder.#onNext, prev: HeroBuilder.#onPrev, goto: HeroBuilder.#onGoto,
      pick: HeroBuilder.#onPick, addStance: HeroBuilder.#onAddStance, removeStance: HeroBuilder.#onRemoveStance,
      create: HeroBuilder.#onCreate, randomize: HeroBuilder.#onRandomize
    }
  };
  static PARTS = { main: { template: `modules/${MOD}/templates/builder.hbs`, scrollable: [".hb-main"] } };

  constructor(actor = null, options = {}) {
    super(options);
    this.actor = actor;
    this.step = 0;
    this.state = {
      name: actor?.name ?? "", img: actor?.img ?? "", heroType: actor?.system?.heroType ?? "focused", level: actor?.system?.level ?? 1,
      archetypes: [], extraArchetypes: [], stances: [{}, {}, {}], frantic: { styles: ["", "", ""], forms: ["", "", ""] },
      build: "", replaceSkill: "", replaceWith: "", customSkill: "", customSkillText: "", description: actor?.system?.description ?? "",
      supers: [], reason: actor?.system?.motive?.reason ?? "", goal: actor?.system?.motive?.goal ?? ""
    };
  }

  /* ------------------------------------------ */
  /*  Lookup helpers                            */
  /* ------------------------------------------ */

  arch(name) { return this.data.archetypes.find(a => a.name === name); }
  form(name) { return this.data.forms.find(f => f.name === name); }
  /** Style lookup across archetypes and freestyles. Returns {style, archetype|null, freestyle}. */
  style(name) {
    for (const a of this.data.archetypes) { const s = a.styles.find(x => x.name === name); if (s) return { style: s, archetype: a.name, freestyle: false }; }
    const f = this.data.freestyles.find(x => x.name === name);
    return f ? { style: { ...f, freestyle: true }, archetype: null, freestyle: true } : null;
  }

  chosenStyles() {
    const s = this.state;
    return s.heroType === "frantic" ? s.frantic.styles.filter(Boolean) : s.stances.map(x => x.style).filter(Boolean);
  }
  chosenForms() {
    const s = this.state;
    return s.heroType === "frantic" ? s.frantic.forms.filter(Boolean) : s.stances.map(x => x.form).filter(Boolean);
  }

  /* ------------------------------------------ */
  /*  Validation (Hero Creation Checklist)      */
  /* ------------------------------------------ */

  validate(stepId) {
    const s = this.state, errs = [];
    const need = TYPE_INFO[s.heroType].archetypes;
    if (stepId === "basics" && !s.name.trim()) errs.push("Give your Hero a name.");
    if (stepId === "archetypes") {
      if (s.archetypes.length !== need) errs.push(`Choose exactly ${need} Archetype${need > 1 ? "s" : ""} (${s.archetypes.length} chosen).`);
      const extra = extraArchetypeSlots(s.heroType, s.level);
      if (s.extraArchetypes.length > extra) errs.push(`At level ${s.level} you can add ${extra} extra Fused Archetype(s).`);
      if (s.extraArchetypes.some(a => s.archetypes.includes(a))) errs.push("Extra Archetypes must be different from your main ones.");
    }
    if (stepId === "stances") {
      const styles = this.chosenStyles(), forms = this.chosenForms();
      const total = s.heroType === "frantic" ? 3 : s.stances.length;
      if (styles.length < total || forms.length < total) errs.push(s.heroType === "frantic" ? "Choose three Styles and three Forms." : "Every Stance needs a Style and a Form.");
      if (new Set(styles).size !== styles.length) errs.push("Each Style must be different.");
      if (new Set(forms).size !== forms.length) errs.push("Each Form must be different.");
      const free = styles.map(n => this.style(n)).filter(x => x?.freestyle);
      if (free.length > 1) errs.push("You can only have ONE Freestyle among all of your Stances.");
      for (const f of free) if (forms.includes(f.style.banned)) errs.push(`${f.style.name} Freestyle bans ${f.style.banned} Form from all of your Stances.`);
      const allArch = [...s.archetypes, ...s.extraArchetypes];
      const fromArch = styles.map(n => this.style(n)).filter(x => x && !x.freestyle);
      for (const x of fromArch) if (!allArch.includes(x.archetype)) errs.push(`${x.style.name} Style belongs to the ${x.archetype}, which you don't have.`);
      if (s.heroType === "fused") for (const a of s.archetypes) if (!fromArch.some(x => x.archetype === a)) errs.push(`Fused Heroes need at least one Style from each Archetype (missing: ${a}).`);
      if (s.heroType === "focused") { const main = fromArch.filter(x => x.archetype === s.archetypes[0]).length; if (main < Math.min(3, total) - free.length) errs.push(`Focused Heroes take their Styles from the ${s.archetypes[0]}.`); }
      if (s.heroType === "frantic") {
        const archs = fromArch.map(x => x.archetype);
        if (new Set(archs).size !== archs.length) errs.push("Frantic Heroes take each Style from a different Archetype.");
      }
    }
    if (stepId === "build" && !s.build) errs.push("Choose a Build.");
    if (stepId === "skills") {
      const words = s.description.trim().split(/\s+/).filter(Boolean);
      if (words.length !== 2) errs.push("Write a two-word description of your Hero (e.g. “Eccentric Gambler”).");
      if (s.replaceSkill && !s.replaceWith && !s.customSkill) errs.push("Pick the replacement Skill (or clear the replacement).");
    }
    if (stepId === "supers" && s.supers.length > superSlots(s.level)) errs.push(`At level ${s.level} you know ${superSlots(s.level)} Super Move(s).`);
    return errs;
  }

  /* ------------------------------------------ */
  /*  Context                                   */
  /* ------------------------------------------ */

  async _prepareContext() {
    this.data ??= await game.patd.api.loadContent();
    const d = this.data, s = this.state;
    const stepId = STEPS[this.step].id;
    const allArch = [...s.archetypes, ...s.extraArchetypes];
    const formOpts = d.forms.map(f => ({ value: f.name, label: `${f.name} Form` }));
    const styleOptsFor = (archNames, { allowFree = true } = {}) => {
      const groups = archNames.map(n => this.arch(n)).filter(Boolean).map(a => ({ label: a.name, options: a.styles.map(x => ({ value: x.name, label: `${x.name} (Range ${x.range}, ${x.keyword})` })) }));
      if (allowFree) groups.push({ label: "Freestyles (one max)", options: d.freestyles.map(x => ({ value: x.name, label: `${x.name} Freestyle (bans ${x.banned})` })) });
      return groups;
    };
    const formCard = (n) => { const f = this.form(n); return f ? { ...f, diceList: f.dice } : null; };
    const styleCard = (n) => { const x = this.style(n); return x ? { ...x.style, archetype: x.archetype, freestyle: x.freestyle } : null; };

    const stances = s.stances.map((st, i) => {
      const f = this.form(st.form);
      let preview = null;
      if (st.form && st.style) {
        const x = this.style(st.style);
        if (f && x) preview = game.patd.api.buildStanceData(f, { ...x.style, archetype: x.archetype }, { alt: st.alt, control: st.control });
      }
      return { ...st, i, n: i + 1, altOptions: f ? [f.name, ...f.altNames] : [], isControl: st.form === "Control", form: st.form, style: st.style,
        formCard: formCard(st.form), styleCard: styleCard(st.style), preview };
    });

    const forms = this.chosenForms();
    const skills = forms.map(n => this.form(n)?.skill).filter(Boolean);
    const allSkills = d.forms.map(f => f.skill.name);
    const superOpts = allArch.map(n => this.arch(n)).filter(Boolean).flatMap(a => a.supers.map(x => ({ ...x, archetype: a.name, chosen: s.supers.includes(x.name) })));

    const errs = this.validate(stepId);
    return {
      steps: STEPS.map((x, i) => ({ ...x, i, active: i === this.step, done: i < this.step })),
      stepId, is: { [stepId]: true }, s, errs, first: this.step === 0, last: this.step === STEPS.length - 1,
      types: Object.entries(TYPE_INFO).map(([k, v]) => ({ key: k, ...v, chosen: s.heroType === k })),
      typeInfo: TYPE_INFO[s.heroType], needArch: TYPE_INFO[s.heroType].archetypes,
      archetypes: d.archetypes.map(a => ({ ...a, chosen: s.archetypes.includes(a.name), extra: s.extraArchetypes.includes(a.name), abilities: a[s.heroType] })),
      extraSlots: extraArchetypeSlots(s.heroType, s.level),
      chosenArch: s.archetypes.map(n => this.arch(n)).filter(Boolean).map(a => ({ ...a, abilities: a[s.heroType] })),
      stances, canAddStance: s.heroType !== "frantic" && s.stances.length < stanceSlots(s.heroType, s.level),
      stanceSlots: stanceSlots(s.heroType, s.level),
      formOpts, styleGroups: styleOptsFor(allArch),
      franticRows: [0, 1, 2].map(i => ({
        i, arch: s.archetypes[i] ?? "", style: s.frantic.styles[i], form: s.frantic.forms[i],
        styleGroups: styleOptsFor(s.archetypes[i] ? [s.archetypes[i], ...s.extraArchetypes] : []),
        styleCard: styleCard(s.frantic.styles[i]), formCard: formCard(s.frantic.forms[i])
      })),
      builds: d.builds.map(b => ({ ...b, chosen: s.build === b.name })),
      skills, allSkills, replaceOptions: allSkills.filter(n => !skills.some(k => k.name === n)),
      superSlots: superSlots(s.level), superOpts,
      bleed: game.patd.PATD.bleedAbilities[s.heroType],
      summary: stepId === "review" ? this.summary() : null,
      applyTo: this.actor?.name ?? null
    };
  }

  summary() {
    const s = this.state;
    const stances = this.stanceDocs().map(x => x.name);
    return {
      title: `${TYPE_INFO[s.heroType].label} ${s.archetypes.join(" / ")}`,
      stances, build: s.build, skills: this.skillDocs().map(x => x.name), description: s.description, supers: s.supers
    };
  }

  /* ------------------------------------------ */
  /*  Document assembly                         */
  /* ------------------------------------------ */

  stanceDocs() {
    const s = this.state, out = [];
    const mk = (styleName, formName, alt, control) => {
      const f = this.form(formName), x = this.style(styleName);
      if (!f || !x) return null;
      return game.patd.api.buildStanceData(f, { ...x.style, archetype: x.archetype }, { alt, control });
    };
    if (s.heroType === "frantic") {
      // Frantic Heroes build Stances on the fly: every Style × Form pairing is available.
      for (const st of s.frantic.styles) for (const fo of s.frantic.forms) { const d = mk(st, fo, "", "max"); if (d) out.push(d); }
    } else for (const st of s.stances) { const d = mk(st.style, st.form, st.alt, st.control); if (d) out.push(d); }
    return out;
  }

  skillDocs() {
    const s = this.state, I = game.patd.api.items;
    const forms = this.chosenForms().map(n => this.form(n)).filter(Boolean);
    let list = forms.map(f => I.skillItem(f.skill.name, f.skill.text, `${f.name} Form`));
    if (s.replaceSkill) {
      list = list.filter(k => k.name !== s.replaceSkill);
      if (s.customSkill) list.push(I.skillItem(s.customSkill, s.customSkillText || "A Skill of your own design.", "Custom"));
      else if (s.replaceWith) { const f = this.data.forms.find(x => x.skill.name === s.replaceWith); if (f) list.push(I.skillItem(f.skill.name, f.skill.text, `${f.name} Form (traded)`)); }
    }
    return list;
  }

  allItems() {
    const s = this.state, I = game.patd.api.items;
    const items = [];
    for (const n of s.archetypes) items.push(I.archetypeItem(this.arch(n), s.heroType));
    for (const n of s.extraArchetypes) items.push(I.archetypeItem(this.arch(n), "fused"));
    for (const n of this.chosenForms()) items.push(I.formItem(this.form(n)));
    for (const n of this.chosenStyles()) { const x = this.style(n); items.push(x.freestyle ? I.freestyleItem(x.style) : I.styleItem(x.style, x.archetype)); }
    items.push(...this.stanceDocs());
    const b = this.data.builds.find(x => x.name === s.build); if (b) items.push(I.buildItem(b));
    items.push(...this.skillDocs());
    for (const name of s.supers) {
      for (const n of [...s.archetypes, ...s.extraArchetypes]) { const a = this.arch(n); const sp = a?.supers.find(x => x.name === name); if (sp) { items.push(I.superItem(sp, a.name)); break; } }
    }
    return items;
  }

  /* ------------------------------------------ */
  /*  Handlers                                  */
  /* ------------------------------------------ */

  static async #onChange(event, form, formData) {
    const o = foundry.utils.expandObject(formData.object);
    const s = this.state;
    for (const k of ["name", "img", "heroType", "build", "replaceSkill", "replaceWith", "customSkill", "customSkillText", "description", "reason", "goal"]) if (k in o) s[k] = o[k];
    if ("level" in o) s.level = Math.max(1, Math.min(10, Number(o.level) || 1));
    if (o.stances) for (const [i, v] of Object.entries(o.stances)) {
      const st = s.stances[Number(i)] ?? {};
      if (v.form !== undefined && v.form !== st.form) st.alt = "";
      Object.assign(st, v); s.stances[Number(i)] = st;
    }
    if (o.frantic) {
      if (o.frantic.styles) for (const [i, v] of Object.entries(o.frantic.styles)) s.frantic.styles[Number(i)] = v;
      if (o.frantic.forms) for (const [i, v] of Object.entries(o.frantic.forms)) s.frantic.forms[Number(i)] = v;
    }
    // keep counts consistent with type/level
    const need = TYPE_INFO[s.heroType].archetypes;
    if (s.archetypes.length > need) s.archetypes = s.archetypes.slice(0, need);
    const max = stanceSlots(s.heroType, s.level);
    while (s.stances.length > max) s.stances.pop();
    s.supers = s.supers.slice(0, superSlots(s.level));
    this.render();
  }

  static #onNext() {
    const errs = this.validate(STEPS[this.step].id);
    if (errs.length) return ui.notifications.warn(errs[0]);
    this.step = Math.min(STEPS.length - 1, this.step + 1);
    if (STEPS[this.step].id === "supers" && superSlots(this.state.level) === 0) this.step++;
    this.render();
  }
  static #onPrev() {
    this.step = Math.max(0, this.step - 1);
    if (STEPS[this.step].id === "supers" && superSlots(this.state.level) === 0) this.step--;
    this.render();
  }
  static #onGoto(event, target) {
    const to = Number(target.dataset.step);
    for (let i = 0; i < to; i++) { const e = this.validate(STEPS[i].id); if (e.length) { this.step = i; ui.notifications.warn(e[0]); return this.render(); } }
    this.step = to; this.render();
  }

  static #onPick(event, target) {
    const s = this.state, { field, value } = target.dataset;
    if (field === "heroType") { s.heroType = value; s.archetypes = s.archetypes.slice(0, TYPE_INFO[value].archetypes); s.stances = s.stances.slice(0, stanceSlots(value, s.level)); while (s.stances.length < 3) s.stances.push({}); }
    if (field === "archetype") {
      const i = s.archetypes.indexOf(value);
      if (i >= 0) s.archetypes.splice(i, 1);
      else {
        if (s.archetypes.length >= TYPE_INFO[s.heroType].archetypes) s.archetypes.shift();
        s.archetypes.push(value);
        s.extraArchetypes = s.extraArchetypes.filter(a => a !== value);
      }
    }
    if (field === "extraArchetype") {
      const i = s.extraArchetypes.indexOf(value);
      if (i >= 0) s.extraArchetypes.splice(i, 1);
      else if (!s.archetypes.includes(value)) { if (s.extraArchetypes.length >= extraArchetypeSlots(s.heroType, s.level)) s.extraArchetypes.shift(); s.extraArchetypes.push(value); }
    }
    if (field === "build") s.build = value;
    if (field === "super") {
      const i = s.supers.indexOf(value);
      if (i >= 0) s.supers.splice(i, 1);
      else { if (s.supers.length >= superSlots(s.level)) s.supers.shift(); s.supers.push(value); }
    }
    this.render();
  }

  static #onAddStance() { if (this.state.stances.length < stanceSlots(this.state.heroType, this.state.level)) { this.state.stances.push({}); this.render(); } }
  static #onRemoveStance(event, target) { if (this.state.stances.length > 3) { this.state.stances.splice(Number(target.dataset.index), 1); this.render(); } }

  static #onRandomize() {
    const s = this.state, d = this.data;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const shuffled = (arr) => [...arr].sort(() => Math.random() - 0.5);
    const need = TYPE_INFO[s.heroType].archetypes;
    s.archetypes = shuffled(d.archetypes).slice(0, need).map(a => a.name);
    const forms = shuffled(d.forms).slice(0, 3).map(f => f.name);
    if (s.heroType === "frantic") {
      s.frantic.styles = s.archetypes.map(n => pick(this.arch(n).styles).name);
      s.frantic.forms = forms;
    } else {
      const pool = s.heroType === "focused" ? shuffled(this.arch(s.archetypes[0]).styles).slice(0, 3)
        : [pick(this.arch(s.archetypes[0]).styles), pick(this.arch(s.archetypes[1]).styles), pick(this.arch(s.archetypes[0]).styles.concat(this.arch(s.archetypes[1]).styles))];
      const names = [...new Set(pool.map(x => x.name))];
      while (names.length < 3) { const extra = pick(this.arch(s.archetypes[0]).styles).name; if (!names.includes(extra)) names.push(extra); }
      s.stances = names.slice(0, 3).map((n, i) => ({ style: n, form: forms[i], alt: "", control: "max" }));
    }
    s.build = pick(d.builds).name;
    const adj = ["Eccentric", "Terrified", "Enraged", "Secretive", "Sad", "Troubled", "Overconfident", "Fiery", "Old", "Sleepy", "Grumpy", "Polite"];
    const noun = ["Gambler", "Clerk", "Wrestler", "Vampire", "Clown", "Cop", "Punk", "Athlete", "Soldier", "Chef", "Courier", "Librarian"];
    if (!s.description) s.description = `${pick(adj)} ${pick(noun)}`;
    this.render();
  }

  static async #onCreate() {
    for (const st of STEPS) { const e = this.validate(st.id); if (e.length) return ui.notifications.warn(e[0]); }
    const s = this.state;
    const items = this.allItems();
    const sys = {
      heroType: s.heroType, level: s.level, description: s.description,
      motive: { reason: s.reason, goal: s.goal }, xp: game.patd.PATD.heroAdvancement[s.level]?.xp ?? 0
    };
    let actor = this.actor;
    if (actor) {
      const ok = await DialogV2.confirm({ window: { title: "Rebuild Hero?" }, content: `<p>Replace <b>${(foundry.utils.escapeHTML ?? ((x) => String(x).replace(/[&<>"]/g, "")))(actor.name)}</b>'s Archetypes, Forms, Styles, Stances, Build, Skills and Super Moves with this build?</p>`, rejectClose: false });
      if (!ok) return;
      const remove = actor.items.filter(i => ["archetype", "form", "style", "stance", "build", "skill", "super"].includes(i.type)).map(i => i.id);
      await actor.deleteEmbeddedDocuments("Item", remove);
      await actor.update({ name: s.name, ...(s.img ? { img: s.img } : {}), system: sys });
    } else {
      actor = await Actor.create({ name: s.name, type: "hero", ...(s.img ? { img: s.img } : {}), system: sys });
    }
    const created = await actor.createEmbeddedDocuments("Item", items);
    const firstStance = created.find(i => i.type === "stance");
    const firstArch = created.find(i => i.type === "archetype");
    await actor.update({ "system.activeStance": firstStance?.id ?? "", "system.franticAbility": s.heroType === "frantic" ? (firstArch?.id ?? "") : "" });
    await actor.update({ "system.hp.value": actor.system.hp.max, "system.healthBars.value": actor.system.healthBars.max });
    ui.notifications.info(`${actor.name} is ready to Panic at the Dojo!`);
    this.close();
    actor.sheet.render(true);
  }
}

/* -------------------------------------------- */
/*  Wiring                                      */
/* -------------------------------------------- */

function open(actor = null) {
  if (game.system.id !== SYS) return ui.notifications.error("The Hero Builder needs the Panic at the Dojo system.");
  new HeroBuilder(actor).render({ force: true });
}

const STYLE_PARTIAL = `<article class="hb-card style">
  <header><span>{{name}} {{#if freestyle}}Freestyle{{else}}Style{{/if}}</span><span>Range: {{range}}</span><em>{{keyword}}</em></header>
  <div class="hb-card__body">{{#if freestyle}}<p class="hb-ban">Banned: {{banned}} Form · Purple Dice {{#each dice}}{{die}} {{/each}}</p>{{/if}}{{#each abilities}}<p>{{this}}</p>{{/each}}</div>
  {{#each actions}}<div class="hb-act"><header>{{cost}}: {{name}}</header><p>{{text}}</p></div>{{/each}}
  {{#if description}}<p class="hb-desc">{{description}}</p>{{/if}}
</article>`;
const FORM_PARTIAL = `<article class="hb-card form">
  <header><span>{{name}} Form</span><small>{{#each altNames}}{{this}}{{#unless @last}} / {{/unless}}{{/each}}</small><em>{{keywords.[0]}} {{keywords.[1]}}</em></header>
  <div class="hb-dice"><b>ACTION DICE:</b> {{#each dice}}<span class="hb-die {{#if purple}}purple{{/if}}">{{die}}</span>{{/each}}</div>
  <div class="hb-card__body">{{#each abilities}}<p>{{this}}</p>{{/each}}</div>
  {{#each actions}}<div class="hb-act"><header>{{cost}}: {{name}}</header><p>{{text}}</p></div>{{/each}}
  <div class="hb-skillbar"><header>{{skill.name}}</header><p>{{skill.text}}</p></div>
</article>`;

Hooks.once("init", () => {
  Handlebars.registerPartial("hbStyle", STYLE_PARTIAL);
  Handlebars.registerPartial("hbForm", FORM_PARTIAL);
  Handlebars.registerHelper("hbgt", (a, b) => Number(a) > Number(b));
  if (!Handlebars.helpers.eq) Handlebars.registerHelper("eq", (a, b) => a === b);
  const load = foundry.applications.handlebars?.loadTemplates ?? (typeof loadTemplates !== "undefined" ? loadTemplates : undefined);
  load([`modules/${MOD}/templates/builder.hbs`]);
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MOD);
  mod.api = { open, HeroBuilder };
});

// Button in the Actors sidebar
Hooks.on("renderActorDirectory", (app, html) => {
  if (game.system.id !== SYS) return;
  if (!game.user.can?.("ACTOR_CREATE") && !game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".patd-hb-open")) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "patd-hb-open";
  btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${game.i18n.localize("PATDHB.Open")}`;
  btn.addEventListener("click", () => open());
  const target = root.querySelector(".header-actions, .directory-header .action-buttons, header") ?? root;
  target.append(btn);
});
