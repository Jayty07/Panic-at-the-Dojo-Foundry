/** Helpers to assemble Stances from Form + Style data (raw JSON or Item system data). */

const norm = (x) => x?.system ? { name: x.name, ...x.system } : x;

/**
 * @param {object} formIn  form data ({name, altNames, keywords, dice, abilities, actions, skill})
 * @param {object} styleIn style data ({name, archetype, keyword, range{min,max} | rangeMin/rangeMax, abilities, actions, freestyle, dice})
 * @param {object} [opts]
 * @param {string} [opts.alt]           chosen Form name (e.g. "Dragon")
 * @param {"max"|"min"} [opts.control]  Control Form choice
 * @returns {object} Item creation data for a "stance" item
 */
export function buildStanceData(formIn, styleIn, { alt = "", control = "max" } = {}) {
  const form = norm(formIn), style = norm(styleIn);
  let min = style.range?.min ?? style.rangeMin ?? 1;
  let max = style.range?.max ?? style.rangeMax ?? 1;
  if (form.name === "Blaster") max += 1;
  if (form.name === "Control") { if (control === "min") min = 0; else max += 3; }

  // Dice: Freestyles replace the Form's green dice with their own purple dice.
  let dice = (form.dice ?? []).map(d => ({ die: d.die, purple: !!d.purple }));
  const isFree = !!style.freestyle;
  if (isFree) dice = [...dice.filter(d => d.purple), ...(style.dice ?? []).map(d => ({ die: d.die, purple: true }))];
  for (const a of style.abilities ?? []) {
    const m = a.match(/^Add (d\d+)\s*to your Action Dice/i);
    if (m) dice.push({ die: m[1], purple: false });
  }
  const armorCount = [...(form.abilities ?? []), ...(style.abilities ?? [])].filter(a => /^You have Armor\b/i.test(a)).length;
  const formLabel = alt || form.name;
  const actions = [
    ...(form.actions ?? []).map(a => ({ cost: a.cost, name: a.name, text: a.text, source: `${form.name} Form` })),
    ...(style.actions ?? []).map(a => ({ cost: a.cost, name: a.name, text: a.text, source: `${style.name} ${isFree ? "Freestyle" : "Style"}` }))
  ];
  return {
    name: `${style.name} ${formLabel} Stance`,
    type: "stance",
    img: "icons/svg/combat.svg",
    system: {
      formName: form.name, formAlt: formLabel, styleName: style.name,
      archetype: isFree ? "Freestyle" : (style.archetype ?? ""), freestyle: isFree,
      keywords: [...new Set([...(form.keywords ?? []), style.keyword].filter(Boolean))],
      dice, range: { min, max }, armor: armorCount,
      formAbilities: form.abilities ?? [], styleAbilities: style.abilities ?? [],
      actions, notes: ""
    }
  };
}

export function rangeLabel(r) { return r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`; }

/** Image picker that works on v12 (AppV1 FilePicker) and v13+ (AppV2 FilePicker). */
export function pickImage(doc) {
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? (typeof FilePicker !== "undefined" ? FilePicker : undefined);
  const fp = new FP({ type: "image", current: doc.img, callback: (path) => doc.update({ img: path }) });
  return fp.render(true);
}
