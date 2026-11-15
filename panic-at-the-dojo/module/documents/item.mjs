import { postCard, esc } from "../chat.mjs";
import { rangeLabel } from "../helpers/stance.mjs";

const list = (arr, cls = "") => arr?.length ? `<ul class="patd-abilities ${cls}">${arr.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : "";
export const actionBlock = (a) => `<div class="patd-action-mini"><div class="patd-action-mini__head"><span class="patd-cost">${esc(a.cost)}</span> ${esc(a.name)}</div>${a.text.split("\n").map(l => `<p>${esc(l)}</p>`).join("")}</div>`;

export class PatdItem extends Item {
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (!data.img || data.img === Item.DEFAULT_ICON) {
      const icons = { stance: "combat", form: "sword", style: "aura", archetype: "mystery-man", build: "statue", super: "explosion", skill: "book", action: "lightning", path: "wing" };
      this.updateSource({ img: `icons/svg/${icons[this.type] ?? "item-bag"}.svg` });
    }
  }

  /** HTML summary used for chat cards and tooltips. */
  summaryHTML() {
    const s = this.system;
    switch (this.type) {
      case "stance": return `<p class="patd-tags"><b>Range</b> ${rangeLabel(s.range)} · <b>Dice</b> ${s.dice.map(d => d.die).join(" ")}</p>${list(s.formAbilities, "form")}${list(s.styleAbilities, "style")}${s.actions.map(actionBlock).join("")}`;
      case "form": return `<p class="patd-tags">${s.keywords.join(" · ")} · Dice ${s.dice.map(d => d.die).join(" ")}</p>${list(s.abilities, "form")}${s.actions.map(actionBlock).join("")}<p><b>${esc(s.skill.name)}:</b> ${esc(s.skill.text)}</p>`;
      case "style": return `<p class="patd-tags">${esc(s.archetype)} · Range ${rangeLabel(s.range)} · ${esc(s.keyword)}${s.freestyle ? ` · Banned: ${esc(s.banned)} Form` : ""}</p>${list(s.abilities, "style")}${s.actions.map(actionBlock).join("")}`;
      case "archetype": return `${list(s.activeAbilities, "option")}${s.actions.map(actionBlock).join("")}`;
      case "build": return `<p><i>${esc(s.flavor)}</i></p>${list(s.abilities, "option")}`;
      case "super": return `<p>${esc(s.effect)}</p>`;
      case "skill": return `<p>${esc(s.text)}</p>`;
      case "action": return actionBlock({ cost: s.cost, name: this.name, text: s.text });
      case "path": return `<p>${esc(s.text)}</p>`;
    }
    return "";
  }

  async toChat() {
    return postCard({ actor: this.actor, kind: `item-${this.type}`, title: this.name, subtitle: game.i18n.localize(`TYPES.Item.${this.type}`), body: this.summaryHTML() });
  }
}
