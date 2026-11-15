import { SYS, SYS_PATH, PATD } from "./config.mjs";

const FILES = ["forms", "archetypes", "freestyles", "builds", "villains", "paths"];
let CACHE = null;

const p = (s) => s ? `<p>${foundry.utils.escapeHTML ? foundry.utils.escapeHTML(s) : s}</p>` : "";

/** Load the rules content shipped with the system (CC-BY-SA, Panic at the Dojo: Patch'd Up). */
export async function loadContent() {
  if (CACHE) return CACHE;
  const out = {};
  await Promise.all(FILES.map(async f => {
    const path = `${SYS_PATH}/data/${f}.json`;
    const route = foundry.utils.getRoute ?? (typeof getRoute !== "undefined" ? getRoute : undefined);
    const res = await fetch(route ? route(path) : path);
    out[f] = await res.json();
  }));
  CACHE = out;
  return out;
}

/* -------------------------------------------- */
/*  Item data converters                        */
/* -------------------------------------------- */

export function formItem(f) {
  return {
    name: `${f.name} Form`, type: "form", img: "icons/svg/sword.svg",
    system: { altNames: f.altNames, keywords: f.keywords, dice: f.dice, abilities: f.abilities, actions: f.actions, skill: f.skill, description: p(f.description) }
  };
}

export function styleItem(s, archetype) {
  return {
    name: `${s.name} Style`, type: "style", img: "icons/svg/aura.svg",
    system: { archetype, keyword: s.keyword, range: { min: s.rangeMin, max: s.rangeMax }, abilities: s.abilities, actions: s.actions, recommended: s.recommended ?? "", description: p(s.description) }
  };
}

export function freestyleItem(s) {
  return {
    name: `${s.name} Freestyle`, type: "style", img: "icons/svg/aura.svg",
    system: { archetype: "Freestyle", keyword: s.keyword, range: { min: s.rangeMin, max: s.rangeMax }, abilities: s.abilities, actions: s.actions, freestyle: true, banned: s.banned, dice: s.dice, recommended: s.recommended ?? "", description: p(s.description) }
  };
}

export function archetypeItem(a, mode = "fused") {
  return {
    name: a.name, type: "archetype", img: "icons/svg/mystery-man.svg",
    system: { keywords: a.keywords, mode, focused: a.focused, fused: a.fused, frantic: a.frantic, actions: a.actions, styles: a.styles.map(s => s.name), notes: a.notes ?? "", description: p(a.description) }
  };
}

export function villainItem(v) {
  return {
    name: v.name, type: "archetype", img: "icons/svg/terror.svg",
    system: { keywords: [], villain: true, mode: "villain", abilities: v.abilities, actions: v.actions, styles: v.styles, description: p(v.description) }
  };
}

export function superItem(s, archetype) {
  return { name: s.name, type: "super", img: "icons/svg/explosion.svg", system: { archetype, superType: s.type ?? "alpha", effect: s.effect, description: p(s.description) } };
}

export function buildItem(b) {
  return { name: b.name, type: "build", img: "icons/svg/statue.svg", system: { flavor: b.flavor, abilities: b.abilities } };
}

export function pathItem(x) { return { name: x.name, type: "path", img: "icons/svg/wing.svg", system: { text: x.text } }; }

export function skillItem(name, text, source = "") { return { name, type: "skill", img: "icons/svg/book.svg", system: { text, source } }; }

/* -------------------------------------------- */
/*  World compendium builder                    */
/* -------------------------------------------- */

const PACKS = [
  { name: "patd-forms", label: "PatD: Forms" },
  { name: "patd-styles", label: "PatD: Styles & Freestyles" },
  { name: "patd-archetypes", label: "PatD: Archetypes" },
  { name: "patd-supers", label: "PatD: Super Moves" },
  { name: "patd-builds", label: "PatD: Builds & Warrior's Paths" },
  { name: "patd-villains", label: "PatD: Villain Archetypes" },
  { name: "patd-skills", label: "PatD: Skills" }
];

let BUSY = false;

export async function importCompendiums({ force = false, quiet = false } = {}) {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can build the Panic at the Dojo compendiums.");
  if (BUSY) return ui.notifications.info("Panic at the Dojo: compendiums are already being built…");
  BUSY = true;
  const say = (m) => { console.log(`${SYS} | ${m}`); if (!quiet) ui.notifications.info(`Panic at the Dojo: ${m}`); };
  try {
    say(force ? "rebuilding rules compendiums…" : "checking rules compendiums…");
    const c = await loadContent();
    const CC = foundry.documents?.collections?.CompendiumCollection ?? (typeof CompendiumCollection !== "undefined" ? CompendiumCollection : undefined);
    const data = {
      "patd-forms": c.forms.map(formItem),
      "patd-styles": [...c.archetypes.flatMap(a => a.styles.map(s => styleItem(s, a.name))), ...c.freestyles.map(freestyleItem)],
      "patd-archetypes": c.archetypes.map(a => archetypeItem(a)),
      "patd-supers": [...c.archetypes.flatMap(a => a.supers.map(s => superItem(s, a.name))), ...c.villains.map(v => superItem({ ...v.super, type: "alpha" }, v.name))],
      "patd-builds": [...c.builds.map(buildItem), ...c.paths.map(pathItem)],
      "patd-villains": c.villains.map(villainItem),
      "patd-skills": c.forms.map(f => skillItem(f.skill.name, f.skill.text, `${f.name} Form`))
    };
    const made = [], kept = [];
    for (const def of PACKS) {
      let pack = game.packs.get(`world.${def.name}`);
      if (!pack) pack = await CC.createCompendium({ name: def.name, label: def.label, type: "Item" });
      if (pack.locked) await pack.configure({ locked: false });
      const index = await pack.getIndex();
      if (index.size && !force) { kept.push(`${def.label} (${index.size})`); continue; }
      if (index.size) await Item.deleteDocuments(index.map(i => i._id), { pack: pack.collection });
      const docs = await Item.createDocuments(data[def.name], { pack: pack.collection });
      made.push(`${def.label} (${docs.length})`);
    }
    await game.settings.set(SYS, "contentImported", game.system.version);
    if (made.length) say(`built ${made.join(", ")}. Open the Compendium Packs tab to find them.`);
    if (kept.length && !made.length) say(`compendiums are already built: ${kept.join(", ")}. Look in the Compendium Packs tab (use Tools → Rebuild to overwrite).`);
    ui.sidebar?.tabs?.compendium?.render?.();
  } catch (err) {
    console.error(`${SYS} | building compendiums failed`, err);
    ui.notifications.error(`Panic at the Dojo: building compendiums failed — ${err?.message ?? err}. Press F12 for details.`, { permanent: true });
  } finally { BUSY = false; }
}
