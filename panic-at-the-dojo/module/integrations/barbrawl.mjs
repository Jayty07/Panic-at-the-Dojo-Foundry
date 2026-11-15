/**
 * Bar Brawl defaults for Panic at the Dojo.
 * Bars are listed from the token edge outwards: HP sits closest to the head,
 * Health Bars above it, then Shield (hidden while empty). Stooges add a member count.
 */
import { SYS } from "../config.mjs";

const M = () => CONST.TOKEN_DISPLAY_MODES;

function bar(id, attribute, mincolor, maxcolor, extra = {}) {
  return {
    id, attribute, mincolor, maxcolor,
    position: "top-outer",
    otherVisibility: M().ALWAYS,
    ownerVisibility: M().ALWAYS,
    gmVisibility: M().ALWAYS,
    style: "user",
    label: "",
    hideCombat: false, hideNoCombat: false, hideEmpty: false, hideFull: false, hideHud: false,
    ignoreMin: false, ignoreMax: false, invert: false, invertDirection: false,
    shareHeight: false, indentLeft: 0, indentRight: 0, opacity: 90,
    subdivisions: null, subdivisionsOwner: false,
    ...extra
  };
}

export const BarBrawl = {
  get active() { return !!game.modules.get("barbrawl")?.active; },

  defaultBars(type) {
    const vis = game.settings.get(SYS, "barVisibility");
    const other = vis === "hover" ? M().HOVER : vis === "owner" ? M().NONE : M().ALWAYS;
    const bars = {
      bar1: bar("bar1", "hp", "#fc2423", "#54fe92", { label: "HP", otherVisibility: other }),
      bar2: bar("bar2", "healthBars", "#723e73", "#c9a227", { label: "Bars", otherVisibility: other }),
      shield: bar("shield", "shield", "#04576f", "#28d0ff", { label: "Shield", hideEmpty: true, otherVisibility: other })
    };
    if (type === "stooges") bars.members = bar("members", "members", "#3a3a3a", "#ffd23f", { label: "Stooges", otherVisibility: other });
    return bars;
  },

  /** Write the default bars onto every actor's prototype token and every placed token. */
  async applyToAll() {
    if (!game.user.isGM) return;
    for (const a of game.actors) {
      await a.update({ "prototypeToken.flags.barbrawl.resourceBars": this.defaultBars(a.type) });
    }
    for (const scene of game.scenes) {
      const updates = scene.tokens.filter(t => t.actor).map(t => ({ _id: t.id, "flags.barbrawl.resourceBars": this.defaultBars(t.actor.type) }));
      if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
    }
    ui.notifications.info("Panic at the Dojo: Bar Brawl bars applied to all actors and tokens.");
  },

  register() {
    // Tokens created from actors without bar flags get the defaults too.
    Hooks.on("preCreateToken", (doc, data) => {
      if (!game.settings.get(SYS, "barbrawlDefaults")) return;
      const has = foundry.utils.getProperty(data, "flags.barbrawl.resourceBars");
      if (has && Object.keys(has).length) return;
      const type = doc.actor?.type ?? "hero";
      doc.updateSource({ "flags.barbrawl.resourceBars": this.defaultBars(type) });
    });
  }
};
