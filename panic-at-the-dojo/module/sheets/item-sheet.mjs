import { PATD, SYS_PATH } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const lines = (t) => String(t ?? "").split("\n").map(s => s.trim()).filter(Boolean);
const csv = (t) => String(t ?? "").split(",").map(s => s.trim()).filter(Boolean);

export const actionsToText = (acts) => (acts ?? []).map(a => `${a.cost}: ${a.name}\n${a.text}`).join("\n\n");
export function textToActions(t, source = "") {
  return String(t ?? "").split(/\n\s*\n/).map(block => {
    const [head, ...rest] = block.trim().split("\n");
    if (!head) return null;
    const i = head.indexOf(":");
    const cost = i >= 0 ? head.slice(0, i).trim() : "1+";
    const name = i >= 0 ? head.slice(i + 1).trim() : head.trim();
    return { cost, name, text: rest.join("\n").trim(), source };
  }).filter(Boolean);
}
export const diceToText = (dice) => (dice ?? []).map(d => `${d.die}${d.purple ? "*" : ""}`).join(" ");
export const textToDice = (t) => String(t ?? "").split(/[\s,]+/).filter(Boolean).map(s => ({ die: s.replace("*", ""), purple: s.endsWith("*") }));

export class PatdItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["patd", "patd-sheet", "patd-item"],
    position: { width: 600, height: 680 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };
  static PARTS = { sheet: { template: `${SYS_PATH}/templates/item/item-sheet.hbs`, scrollable: [".patd-item-body"] } };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const item = this.item, s = item.system;
    Object.assign(ctx, {
      item, system: s, editable: this.isEditable, type: item.type,
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      is: { [item.type]: true },
      text: {
        abilities: (s.abilities ?? []).join("\n"),
        formAbilities: (s.formAbilities ?? []).join("\n"),
        styleAbilities: (s.styleAbilities ?? []).join("\n"),
        focused: (s.focused ?? []).join("\n"), fused: (s.fused ?? []).join("\n"), frantic: (s.frantic ?? []).join("\n"),
        actions: actionsToText(s.actions), dice: diceToText(s.dice),
        altNames: (s.altNames ?? []).join(", "), keywords: (s.keywords ?? []).join(", "), styles: (s.styles ?? []).join(", ")
      },
      modes: { focused: "Focused", fused: "Fused", frantic: "Frantic", villain: "Villain" },
      superTypes: { alpha: "Alpha", delta: "Delta" },
      keywordOptions: Object.fromEntries(PATD.keywords.map(k => [k, k]))
    });
    return ctx;
  }

  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const v = data.virtual ?? {};
    delete data.virtual;
    const sys = data.system ??= {};
    for (const k of ["abilities", "formAbilities", "styleAbilities", "focused", "fused", "frantic"]) if (k in v) sys[k] = lines(v[k]);
    if ("actions" in v) sys.actions = textToActions(v.actions, this.item.name);
    if ("dice" in v) sys.dice = textToDice(v.dice);
    for (const k of ["altNames", "keywords", "styles"]) if (k in v) sys[k] = csv(v[k]);
    return data;
  }
}
