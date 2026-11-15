/**
 * Panic at the Dojo: Patch'd Up — unofficial Foundry VTT system.
 * Rules text © Vel Mini / Liberi Gothica Games, CC-BY-SA 4.0.
 */
import { PATD, SYS, SYS_PATH } from "./module/config.mjs";
import * as models from "./module/data/models.mjs";
import { PatdActor } from "./module/documents/actor.mjs";
import { PatdItem } from "./module/documents/item.mjs";
import { PatdActorSheet, startTurnDialog, stanceCheckDialog } from "./module/sheets/actor-sheet.mjs";
import { PatdItemSheet } from "./module/sheets/item-sheet.mjs";
import { PatdCombat, Meter, InitiativeMeterApp } from "./module/combat.mjs";
import { registerChatHooks, useAction, useSuper, damageDialog, postCard } from "./module/chat.mjs";
import { registerSocket } from "./module/socket.mjs";
import { BarBrawl } from "./module/integrations/barbrawl.mjs";
import { registerIsometric } from "./module/integrations/isometric.mjs";
import { FX, registerScrollingText } from "./module/integrations/sequencer.mjs";
import * as content from "./module/content.mjs";
import { buildStanceData } from "./module/helpers/stance.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/* -------------------------------------------- */
/*  Tools window (settings menu)                */
/* -------------------------------------------- */

class PatdToolsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "patd-tools", classes: ["patd", "patd-tools"],
    window: { title: "Panic at the Dojo Tools", icon: "fa-solid fa-hand-fist" },
    position: { width: 440, height: "auto" },
    actions: {
      importContent: async () => content.importCompendiums({ force: false }),
      rebuildContent: async () => content.importCompendiums({ force: true }),
      applyBars: async () => BarBrawl.applyToAll(),
      openMeter: () => game.patd.meterApp.render({ force: true })
    }
  };
  static PARTS = { main: { template: `${SYS_PATH}/templates/apps/tools.hbs` } };
  async _prepareContext() {
    return { barbrawl: BarBrawl.active, iso: !!game.modules.get("isometric-perspective")?.active, seq: !!game.modules.get("sequencer")?.active, jb2a: !!(game.modules.get("JB2A_DnD5e")?.active || game.modules.get("jb2a_patreon")?.active) };
  }
}

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log(`${SYS} | Panic at the Dojo: Patch'd Up | initializing`);
  CONFIG.PATD = PATD;

  CONFIG.Actor.documentClass = PatdActor;
  CONFIG.Item.documentClass = PatdItem;
  CONFIG.Combat.documentClass = PatdCombat;
  CONFIG.Combat.initiative = { formula: "0", decimals: 0 };

  Object.assign(CONFIG.Actor.dataModels, { hero: models.HeroData, warrior: models.WarriorData, boss: models.BossData, stooges: models.StoogesData });
  Object.assign(CONFIG.Item.dataModels, {
    stance: models.StanceData, form: models.FormData, style: models.StyleData, archetype: models.ArchetypeData,
    build: models.BuildData, super: models.SuperData, skill: models.SkillData, action: models.ActionData, path: models.PathData
  });

  const tokenValues = [...PATD.basicTokens, ...PATD.statusTokens, ...PATD.uniqueTokens].map(k => `tokens.${k}`);
  const trackable = { bar: ["hp", "healthBars", "shield"], value: ["level", ...tokenValues] };
  CONFIG.Actor.trackableAttributes = {
    hero: trackable, warrior: trackable, boss: trackable,
    stooges: { bar: [...trackable.bar, "members"], value: trackable.value }
  };

  CONFIG.statusEffects = [
    { id: "dizzy", name: "Dizzy", img: "icons/svg/daze.svg" },
    { id: "takenOut", name: "Taken Out", img: "icons/svg/skull.svg" },
    { id: "bleeding", name: "Bleeding", img: "icons/svg/blood.svg" },
    { id: "outOfPlay", name: "Removed From Play", img: "icons/svg/door-exit.svg" },
    { id: "challenged", name: "Challenged", img: "icons/svg/target.svg" },
    { id: "guarding", name: "Temporary Armor", img: "icons/svg/shield.svg" }
  ];
  CONFIG.specialStatusEffects.DEFEATED = "takenOut";

  // Sheets
  const DSC = foundry.applications.apps?.DocumentSheetConfig ?? (typeof DocumentSheetConfig !== "undefined" ? DocumentSheetConfig : undefined);
  DSC.registerSheet(Actor, SYS, PatdActorSheet, { types: ["hero", "warrior", "boss", "stooges"], makeDefault: true, label: "PATD.SheetActor" });
  DSC.registerSheet(Item, SYS, PatdItemSheet, { makeDefault: true, label: "PATD.SheetItem" });

  registerSettings();

  const load = foundry.applications.handlebars?.loadTemplates ?? (typeof loadTemplates !== "undefined" ? loadTemplates : undefined);
  load([`${SYS_PATH}/templates/actor/actor-sheet.hbs`, `${SYS_PATH}/templates/item/item-sheet.hbs`, `${SYS_PATH}/templates/apps/initiative-meter.hbs`, `${SYS_PATH}/templates/apps/tools.hbs`]);

  Handlebars.registerHelper("patdRange", (r) => r ? (r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`) : "");
  Handlebars.registerHelper("patdGate", (line) => /^\d+\+(?:,[^:]*)?:|^\d+ [A-Za-z]+(?: Tokens?)?:/i.test(line ?? ""));

  game.patd = {
    PATD, FX, Meter,
    weight: () => PATD.weights[game.settings.get(SYS, "cinematicWeight")] ?? PATD.weights.middleweight,
    meter: Meter,
    barbrawl: BarBrawl,
    content,
    api: { buildStanceData, loadContent: content.loadContent, items: content, startTurnDialog, stanceCheckDialog, useAction, useSuper, damageDialog, postCard }
  };

  registerChatHooks();
  registerScrollingText();
  registerIsometric();
  BarBrawl.register();
});

function registerSettings() {
  const refresh = () => {
    for (const a of game.actors) { a.prepareData(); if (a.sheet?.rendered) a.sheet.render(); }
    for (const t of canvas?.tokens?.placeables ?? []) { t.actor?.prepareData(); t.renderFlags?.set({ refreshBars: true }); }
    game.patd?.meterApp?.rendered && game.patd.meterApp.render();
  };
  game.settings.register(SYS, "cinematicWeight", {
    name: "Cinematic Weight", hint: "Sets HP per Health Bar, Heal Value, Bleed Value and Super Move frequency for the current fight.",
    scope: "world", config: true, type: String, default: "middleweight",
    choices: Object.fromEntries(Object.entries(PATD.weights).map(([k, v]) => [k, `${v.label} (${v.hp} HP)`])), onChange: refresh
  });
  game.settings.register(SYS, "sequencerFx", { name: "Sequencer move animations", hint: "Shout attack names, show impacts, afterimages, teleports and Super Move cut-ins (requires the Sequencer module; JB2A is used when available).", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(SYS, "sequencerCrosshair", { name: "Use Sequencer crosshair for movement", hint: "Pick push, pull, move and teleport destinations with Sequencer's crosshair. Off: click on the map instead.", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(SYS, "barbrawlDefaults", { name: "Bar Brawl default bars", hint: "Give new actors and tokens HP, Health Bars and Shield bars (requires Bar Brawl).", scope: "world", config: true, type: Boolean, default: true });
  game.settings.register(SYS, "barVisibility", { name: "Bar visibility for other players", scope: "world", config: true, type: String, default: "always", choices: { always: "Always", hover: "On hover", owner: "Owners and GM only" } });
  game.settings.register(SYS, "isoFloatBars", { name: "Isometric: float bars over heads", hint: "In isometric scenes, stand token bars upright above the token art.", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(SYS, "isoFloatNameplate", { name: "Isometric: float nameplates too", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(SYS, "isoBarOffset", { name: "Isometric: bar height offset (px)", hint: "Extra gap between the top of the token art and the bars.", scope: "client", config: true, type: Number, default: 6, range: { min: -100, max: 200, step: 2 } });
  game.settings.register(SYS, "isoBarScale", { name: "Isometric: bar scale", scope: "client", config: true, type: Number, default: 1, range: { min: 0.4, max: 2.5, step: 0.05 } });
  game.settings.register(SYS, "autoImport", { name: "Build rules compendiums on first load", scope: "world", config: true, type: Boolean, default: true });
  game.settings.register(SYS, "contentImported", { scope: "world", config: false, type: String, default: "" });
  game.settings.registerMenu(SYS, "tools", { name: "Panic at the Dojo Tools", label: "Open Tools", hint: "Build or rebuild the rules compendiums, apply Bar Brawl bars to everything, open the Initiative Meter.", icon: "fa-solid fa-hand-fist", type: PatdToolsApp, restricted: true });
}

/* -------------------------------------------- */
/*  Ready                                       */
/* -------------------------------------------- */

Hooks.once("ready", async () => {
  game.patd.meterApp = new InitiativeMeterApp();
  registerSocket({ damageDialog, meter: (data, from) => Meter.handle(data, from) });
  if (game.user.isGM && game.settings.get(SYS, "autoImport") && !game.settings.get(SYS, "contentImported")) {
    await content.importCompendiums({ quiet: false });
  }
  if (game.combat?.started) game.patd.meterApp.render({ force: true });
});

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

const rerenderMeter = () => { if (game.patd?.meterApp?.rendered) game.patd.meterApp.render(); };
Hooks.on("updateCombat", rerenderMeter);
Hooks.on("createCombatant", rerenderMeter);
Hooks.on("deleteCombatant", rerenderMeter);
Hooks.on("updateCombatant", rerenderMeter);
Hooks.on("updateActor", (actor) => { if (game.combat?.combatants.some(c => c.actor?.id === actor.id)) rerenderMeter(); });
Hooks.on("deleteCombat", async (combat) => {
  rerenderMeter();
  if (!game.user.isGM || !combat.started) return;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Fight over" }, content: "<p>Reset all fighters from this encounter (HP, Health Bars, tokens, once-per-fight uses)? Remember: winners gain 2 XP, losers 1 XP. Every 5 XP is a level.</p>", rejectClose: false });
  if (ok) for (const c of combat.combatants) await c.actor?.resetForFight();
});

// Keep the Bleeding status in sync (one client does it)
Hooks.on("updateActor", async (actor) => {
  if (game.users.activeGM?.id !== game.user.id) return;
  const want = actor.system.bleeding && actor.system.hp.value > 0;
  if (want !== actor.statuses.has("bleeding")) await actor.toggleStatusEffect("bleeding", { active: want });
});

// Scene control button for the meter (v13+ object form, v12 array form)
Hooks.on("getSceneControlButtons", (controls) => {
  const tool = { name: "patdMeter", title: "Initiative Meter", icon: "fa-solid fa-bolt", button: true, visible: true, order: 99,
    onChange: () => game.patd.meterApp.render({ force: true }), onClick: () => game.patd.meterApp.render({ force: true }) };
  if (Array.isArray(controls)) controls.find(c => c.name === "token")?.tools.push(tool);
  else if (controls.tokens?.tools) controls.tokens.tools.patdMeter = tool;
});

// Combat tracker shortcut
Hooks.on("renderCombatTracker", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".patd-meter-open")) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "patd-meter-open";
  btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Initiative Meter`;
  btn.addEventListener("click", () => game.patd.meterApp.render({ force: true }));
  (root.querySelector(".combat-tracker-header, header, .encounter-controls") ?? root).prepend(btn);
});

// Supers count toward the side's per-Round limit
Hooks.on("createChatMessage", (msg) => {
  if (!game.user.isGM) return;
  const kind = msg.getFlag(SYS, "kind");
  if (!String(kind).startsWith("super-")) return;
  const uuid = msg.getFlag(SYS, "actorUuid"); const a = uuid ? fromUuidSync(uuid) : null;
  if (a) Meter.recordSuper(a.id);
});

// Import button in the compendium sidebar
Hooks.on("renderCompendiumDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".patd-import")) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "patd-import";
  btn.innerHTML = `<i class="fa-solid fa-hand-fist"></i> Build PatD Compendiums`;
  btn.addEventListener("click", () => content.importCompendiums({ force: false }));
  (root.querySelector(".directory-footer, footer") ?? root).append(btn);
});
