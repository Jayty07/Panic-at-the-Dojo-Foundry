import { PATD, SYS } from "./config.mjs";
import { FX } from "./integrations/sequencer.mjs";
import { socketRequest } from "./socket.mjs";

const { DialogV2 } = foundry.applications.api;
const TOKEN_WORDS = [...PATD.basicTokens, ...PATD.statusTokens, ...PATD.uniqueTokens];

export const esc = (s) => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s ?? "")) : String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* -------------------------------------------- */
/*  Card output                                 */
/* -------------------------------------------- */

export async function postCard({ actor, kind = "info", title = "", subtitle = "", body = "", rolls = [], flags = {}, whisper = null }) {
  const img = actor?.img ?? "icons/svg/mystery-man.svg";
  const content = `
  <div class="patd-card patd-card--${kind}">
    <header class="patd-card__head">
      <img src="${img}" alt=""/>
      <div class="patd-card__titles"><h3>${esc(title)}</h3>${subtitle ? `<h4>${esc(subtitle)}</h4>` : ""}</div>
    </header>
    <div class="patd-card__body">${body}</div>
  </div>`;
  const data = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    flags: { [SYS]: { actorUuid: actor?.uuid ?? null, kind, ...flags } }
  };
  if (whisper) data.whisper = whisper;
  if (rolls.length) data.sound = CONFIG.sounds.dice;
  return ChatMessage.create(data);
}

/* -------------------------------------------- */
/*  Cost parsing                                */
/* -------------------------------------------- */

export function parseCost(cost) {
  const alts = String(cost).split(/\s+-?or-?\s+/i).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const a of alts) {
    let m;
    if ((m = a.match(/^(\d+)\+/))) out.push({ type: "dice", min: Number(m[1]), label: a });
    else if (/^X$/i.test(a)) out.push({ type: "x", min: 0, label: "X" });
    else if ((m = a.match(/^(?:Pay\s+)?(\d+|X)\s*HP$/i))) out.push({ type: "hp", n: m[1] === "X" ? null : Number(m[1]), label: a });
    else if ((m = a.match(/^(\d+)\s+([A-Za-z]+)\s+Tokens?$/i)) && TOKEN_WORDS.includes(m[2].toLowerCase())) out.push({ type: "token", n: Number(m[1]), key: m[2].toLowerCase(), label: a });
    else if (/^Free$/i.test(a)) out.push({ type: "free", label: "Free" });
    else if (/^\d+$/.test(a)) out.push({ type: "loose", n: Number(a), label: a });
    else out.push({ type: "manual", label: a });
  }
  // "3 or 4 or 5 Basic Tokens" — trailing unit applies to bare numbers
  const last = out[out.length - 1];
  if (last?.type === "manual") for (const o of out) if (o.type === "loose") { o.type = "manual"; o.label = `${o.n} ${last.label.replace(/^\d+\s*/, "")}`; }
  return out.map(o => o.type === "loose" ? { type: "manual", label: o.label } : o);
}

const gateValue = (line) => { const m = line.match(/^(\d+)\+(?:,[^:]*)?:/); return m ? Number(m[1]) : null; };
const tokenGate = (line) => { const m = line.match(/^(\d+)\s+([A-Za-z]+)(?: Tokens?)?:/i); return m ? { n: Number(m[1]), key: m[2].toLowerCase() } : null; };

/* -------------------------------------------- */
/*  Using an Action                             */
/* -------------------------------------------- */

export async function useAction(actor, action, { sourceLabel = "" } = {}) {
  const alts = parseCost(action.cost);
  const pool = actor.system.pool;
  const buttons = [];
  const diceMin = Math.min(...alts.filter(a => a.type === "dice" || a.type === "x").map(a => a.min), Infinity);
  if (diceMin !== Infinity) {
    const seen = new Set();
    pool.forEach((n, i) => {
      if (n < diceMin) return;
      if (seen.has(n)) return; seen.add(n);
      buttons.push({ action: `n:${i}`, label: `Spend ${n}`, icon: "fa-solid fa-dice-d6" });
    });
  }
  alts.filter(a => !["dice", "x"].includes(a.type)).forEach((a, i) => buttons.push({ action: `a:${alts.indexOf(a)}`, label: a.type === "free" ? "Use (Free)" : `Pay ${a.label}`, icon: "fa-solid fa-coins" }));
  if (!buttons.length) {
    ui.notifications.warn(diceMin !== Infinity ? `No number in the Action Pool can pay ${action.cost}.` : `Cannot pay ${action.cost}.`);
    return;
  }
  let choice;
  if (buttons.length === 1 && !buttons[0].action.startsWith("n:")) choice = buttons[0].action;
  else {
    choice = await DialogV2.wait({
      window: { title: `${action.name} (${action.cost})` },
      classes: ["patd-dialog"],
      content: `<p class="patd-dialog__hint">Choose how to pay for <b>${esc(action.name)}</b>.</p>`,
      buttons, rejectClose: false
    });
  }
  if (!choice) return;

  let spent = null, paidLabel = "", tokenPaid = null;
  if (choice.startsWith("n:")) {
    const idx = Number(choice.slice(2));
    spent = pool[idx];
    await actor.spendNumbers([idx]);
    paidLabel = `Spent a ${spent}`;
  } else {
    const alt = alts[Number(choice.slice(2))];
    paidLabel = alt.type === "free" ? "Free" : `Paid ${alt.label}`;
    if (alt.type === "hp") {
      let n = alt.n;
      if (n === null) n = Number(await DialogV2.prompt({ window: { title: "Pay X HP" }, content: `<input type="number" name="x" value="1" min="1" autofocus>`, ok: { callback: (e, b) => b.form.elements.x.value } }));
      await actor.applyDamage(n, { source: "cost" });
      spent = n;
    } else if (alt.type === "token") {
      if ((actor.system.tokens[alt.key] ?? 0) < alt.n) { ui.notifications.warn(`Not enough ${alt.key} tokens.`); return; }
      await actor.update({ [`system.tokens.${alt.key}`]: actor.system.tokens[alt.key] - alt.n });
      tokenPaid = alt;
    }
  }

  const xValue = spent;
  const lines = String(action.text).split("\n").filter(Boolean);
  const rendered = [];
  const reached = [];
  for (const line of lines) {
    const g = gateValue(line), tg = tokenGate(line);
    let ok = true;
    if (g !== null) ok = spent !== null && spent >= g;
    else if (tg && TOKEN_WORDS.includes(tg.key)) ok = !!tokenPaid && tokenPaid.key === tg.key && tokenPaid.n >= tg.n;
    const txt = (/\bX\b/.test(line) && xValue !== null) ? line.replace(/\bX\b/g, `X(${xValue})`) : line;
    rendered.push(`<p class="patd-line ${ok ? "reached" : "locked"}">${esc(txt)}</p>`);
    if (ok) reached.push(xValue !== null ? line.replace(/\bX\b/g, String(xValue)) : line);
  }
  const effects = extractEffects(reached);
  const targets = [...game.user.targets].map(t => t.name);
  const body = `
    <div class="patd-action-cost"><span class="patd-cost">${esc(action.cost)}</span><span class="patd-paid">${esc(paidLabel)}</span></div>
    <div class="patd-action-text">${rendered.join("")}</div>
    ${targets.length ? `<p class="patd-note"><i class="fa-solid fa-crosshairs"></i> Targets: ${targets.map(esc).join(", ")}</p>` : ""}
    ${effectButtons(effects)}`;
  await postCard({ actor, kind: "action", title: action.name, subtitle: sourceLabel, body, flags: { spent } });
  FX.action(actor, action, [...game.user.targets], { spent });
}

export async function useSuper(actor, item) {
  const pool = actor.system.pool;
  const pairs = [];
  const seen = new Set();
  pool.forEach((n, i) => {
    if (n < 3 || seen.has(n)) return;
    const j = pool.findIndex((m, k) => k !== i && m === n);
    if (j >= 0) { pairs.push({ n, i, j }); seen.add(n); }
  });
  const warn = [];
  if ((game.combat?.round ?? 2) <= 1) warn.push("Super Moves cannot be used on the first Round of a fight.");
  if (actor.system.superUsed) warn.push("This unit has already used its Super Move this fight.");
  if (game.patd.weight().supers === 0) warn.push("Super Moves are banned in Featherweight fights.");
  if (!pairs.length) { ui.notifications.warn("A Super Move needs two matching numbers of 3 or higher."); return; }
  const buttons = pairs.map(p => ({ action: `${p.i},${p.j}`, label: `Spend ${p.n} + ${p.n}`, icon: "fa-solid fa-bolt" }));
  const choice = await DialogV2.wait({
    window: { title: `Super Move: ${item.name}` }, classes: ["patd-dialog"],
    content: `${warn.map(w => `<p class="patd-warn">${esc(w)}</p>`).join("")}<p>Super Moves are not Actions: they ignore Abilities, and tokens cannot respond to them. Armor still applies.</p>`,
    buttons, rejectClose: false
  });
  if (!choice) return;
  const [i, j] = choice.split(",").map(Number);
  await actor.spendNumbers([i, j]);
  await actor.update({ "system.superUsed": true });
  const effects = extractEffects([item.system.effect]);
  const body = `<div class="patd-super-banner ${item.system.superType}">${item.system.superType === "alpha" ? "α" : "Δ"} SUPER</div>
    <p class="patd-super-effect">${esc(item.system.effect)}</p>${effectButtons(effects)}`;
  await postCard({ actor, kind: `super-${item.system.superType}`, title: item.name, subtitle: `${item.system.archetype} ${item.system.superType === "alpha" ? "Alpha" : "Delta"} Super`, body });
  FX.superMove(actor, item, [...game.user.targets]);
}

/* -------------------------------------------- */
/*  Effect extraction                           */
/* -------------------------------------------- */

export function extractEffects(lines) {
  let fx = [];
  const tokRe = TOKEN_WORDS.join("|");
  for (let line of lines) {
    const found = [];
    const l = line.replace(/^\d+\+(?:,[^:]*)?:\s*/, "");
    let m;
    const re = (r) => new RegExp(r, "gi");
    for (m of l.matchAll(re(String.raw`deal (\d+) damage`))) found.push({ type: "damage", n: +m[1] });
    for (m of l.matchAll(re(String.raw`push (?:them |that enemy |everyone )?(?:up to )?(\d+)`))) found.push({ type: "push", n: +m[1] });
    for (m of l.matchAll(re(String.raw`pull (them |that enemy |everyone )?(?:up to )?(\d+)`))) found.push({ type: "pull", n: +m[2] });
    for (m of l.matchAll(re(String.raw`pull yourself (\d+)`))) found.push({ type: "move", n: +m[1] });
    for (m of l.matchAll(re(String.raw`teleport (?:up to )?(\d+)`))) found.push({ type: "teleport", n: +m[1] });
    for (m of l.matchAll(re(String.raw`\bmove (?:up to )?(\d+)`))) found.push({ type: "move", n: +m[1] });
    for (m of l.matchAll(re(String.raw`\bheal (\d+)`))) found.push({ type: "heal", n: +m[1] });
    if (/\bheals?\b(?!\s+\d)/i.test(l) && !/heal (\d+)/i.test(l)) found.push({ type: "heal", n: null });
    for (const clause of l.split(/[.;]|,\s*then\s+|\s-or-\s/i)) {
      const toks = [...clause.matchAll(re(String.raw`(\d+) (?:more )?(${tokRe}) tokens?`))];
      if (!toks.length) continue;
      const toOthers = /\bgive\b/i.test(clause) || /\b(enem(?:y|ies)|they|them|ally|allies|each|someone)\b[^,]*?\bgains?\b/i.test(clause);
      const toSelf = !toOthers && /\bgains?\b/i.test(clause);
      if (!toOthers && !toSelf) continue;
      for (const t of toks) found.push({ type: toOthers ? "give" : "gain", n: +t[1], key: t[2].toLowerCase() });
    }
    for (m of l.matchAll(re(String.raw`(?:gain|give [a-z ]*?)(?:an? )?shield (\d+)|gain an? (\d+)-point shield`))) found.push({ type: "shield", n: +(m[1] ?? m[2]) });
    if (/\bchallenge\b/i.test(l) && !/challenge token/i.test(l)) found.push({ type: "challenge" });
    if (/swap spaces/i.test(l)) found.push({ type: "swap" });
    if (/temporary armor/i.test(l)) found.push({ type: "tempArmor" });
    if (/\binstead\b/i.test(l)) {
      const types = new Set(found.map(f => f.type));
      fx = fx.filter(f => !types.has(f.type));
    }
    fx.push(...found);
  }
  // de-duplicate identical buttons
  const key = f => `${f.type}:${f.n ?? ""}:${f.key ?? ""}`;
  const seen = new Set();
  return fx.filter(f => { const k = key(f); if (seen.has(k) && !["damage"].includes(f.type)) return false; seen.add(k); return true; });
}

const FX_LABEL = {
  damage: (f) => `<i class="fa-solid fa-burst"></i> Deal ${f.n} dmg`,
  push: (f) => `<i class="fa-solid fa-arrow-right-from-bracket"></i> Push ${f.n}`,
  pull: (f) => `<i class="fa-solid fa-arrow-right-to-bracket"></i> Pull ${f.n}`,
  move: (f) => `<i class="fa-solid fa-person-running"></i> Move ${f.n}`,
  teleport: (f) => `<i class="fa-solid fa-wand-sparkles"></i> Teleport ${f.n}`,
  heal: (f) => `<i class="fa-solid fa-heart-pulse"></i> Heal ${f.n ?? ""}`,
  gain: (f) => `<i class="${PATD.tokenIcons[f.key] ?? "fa-solid fa-circle"}"></i> Gain ${f.n} ${PATD.tokenLabels[f.key] ?? f.key}`,
  give: (f) => `<i class="${PATD.tokenIcons[f.key] ?? "fa-solid fa-circle"}"></i> Give ${f.n} ${PATD.tokenLabels[f.key] ?? f.key}`,
  shield: (f) => `<i class="fa-solid fa-shield"></i> Shield ${f.n}`,
  challenge: () => `<i class="fa-solid fa-hand-point-right"></i> Challenge`,
  swap: () => `<i class="fa-solid fa-right-left"></i> Swap`,
  tempArmor: () => `<i class="fa-solid fa-helmet-un"></i> Temp Armor`
};

export function effectButtons(effects) {
  if (!effects.length) return "";
  return `<div class="patd-fx-buttons">${effects.map(f => `<button type="button" class="patd-fx patd-fx--${f.type}" data-fx="${f.type}" data-n="${f.n ?? ""}" data-key="${f.key ?? ""}">${FX_LABEL[f.type](f)}</button>`).join("")}</div>
  <p class="patd-note patd-fx-hint">Target tokens first, then click. Movement buttons let you pick the destination on the map.</p>`;
}

/* -------------------------------------------- */
/*  Chat listeners                              */
/* -------------------------------------------- */

export function registerChatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll(".patd-fx").forEach(btn => btn.addEventListener("click", (ev) => onEffectButton(ev, message)));
  });
}

function speakerActor(message) {
  const uuid = message.getFlag(SYS, "actorUuid");
  return uuid ? fromUuidSync(uuid) : ChatMessage.getSpeakerActor(message.speaker);
}

export function tokenFor(actor) {
  const t = actor?.token?.object ?? actor?.getActiveTokens?.()[0];
  return t ?? null;
}

async function onEffectButton(ev, message) {
  ev.preventDefault();
  const b = ev.currentTarget;
  const type = b.dataset.fx;
  const n = b.dataset.n === "" ? null : Number(b.dataset.n);
  const key = b.dataset.key || null;
  const actor = speakerActor(message);
  if (!actor) return ui.notifications.warn("The acting character could not be found.");
  if (!actor.isOwner && !game.user.isGM) return ui.notifications.warn("Only the acting character's owner can resolve these effects.");
  const targets = [...game.user.targets];
  const needTargets = ["damage", "push", "pull", "give", "challenge", "swap"].includes(type);
  if (needTargets && !targets.length) return ui.notifications.warn("Target one or more tokens first (T key, or double right-click).");
  const myToken = tokenFor(actor);

  switch (type) {
    case "damage":
      for (const t of targets) { FX.strike(myToken, t); await requestDamage(t.actor, n, actor.name); }
      break;
    case "heal": {
      const list = targets.length ? targets.map(t => t.actor) : [actor];
      for (const a of list) await actorOp(a, "heal", [n]);
      break;
    }
    case "gain": await actor.modToken(key, n); break;
    case "give": for (const t of targets) await actorOp(t.actor, "modToken", [key, n]); break;
    case "shield": {
      const list = targets.length && /ally/i.test(message.content) ? targets.map(t => t.actor) : [actor];
      for (const a of list) await actorOp(a, "gainShield", [n]);
      break;
    }
    case "challenge": for (const t of targets) { await actorOp(t.actor, "setChallenge", [actor.name]); FX.challenge(myToken, t); } break;
    case "tempArmor": await actor.update({ "system.armor.temporary": true }); FX.shield(actor, 0, true); break;
    case "push": case "pull":
      for (const t of targets) await forcedMove(myToken, t, type, n);
      break;
    case "move": case "teleport":
      if (!myToken) return ui.notifications.warn("Place this character's token on the scene first.");
      await selfMove(myToken, type, n);
      break;
    case "swap": {
      const t = targets[0];
      if (!myToken) return;
      const a = { x: myToken.document.x, y: myToken.document.y }, c = { x: t.document.x, y: t.document.y };
      FX.teleport(myToken, c); FX.teleport(t, a);
      await moveToken(myToken.document, c, { teleport: true });
      await moveToken(t.document, a, { teleport: true });
      break;
    }
  }
}

/* -------------------------------------------- */
/*  Movement                                    */
/* -------------------------------------------- */

async function forcedMove(source, target, kind, n) {
  const dest = await FX.pickLocation({ origin: target, range: n, label: `${kind === "push" ? "Push" : "Pull"} ${target.name} up to ${n}`, color: kind === "push" ? "#fc2423" : "#527afd" });
  if (!dest) return;
  const pos = snapFor(target, dest);
  await FX.forced(source, target, pos, kind);
  await moveToken(target.document, pos, {});
}

async function selfMove(token, kind, n) {
  const dest = await FX.pickLocation({ origin: token, range: n, label: `${kind === "teleport" ? "Teleport" : "Move"} up to ${n}`, color: kind === "teleport" ? "#9a0089" : "#1d6d43" });
  if (!dest) return;
  const pos = snapFor(token, dest);
  if (kind === "teleport") FX.teleport(token, pos);
  await moveToken(token.document, pos, { teleport: kind === "teleport" });
}

function snapFor(token, center) {
  const tl = { x: center.x - token.w / 2, y: center.y - token.h / 2 };
  try {
    if (typeof token.getSnappedPosition === "function") return token.getSnappedPosition(tl);
    return canvas.grid.getSnappedPoint(tl, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
  } catch { return tl; }
}

export async function moveToken(doc, pos, { teleport = false } = {}) {
  if (doc.isOwner) return doc.update({ x: pos.x, y: pos.y }, { animate: !teleport, teleport, [SYS]: { forced: true } });
  return socketRequest("moveToken", { uuid: doc.uuid, x: pos.x, y: pos.y, teleport });
}

/* -------------------------------------------- */
/*  Ownership-aware operations                  */
/* -------------------------------------------- */

export async function actorOp(actor, op, args) {
  if (!actor) return;
  if (actor.isOwner) return actor[op](...args);
  return socketRequest("actorOp", { uuid: actor.uuid, op, args });
}

export async function requestDamage(actor, amount, attackerName) {
  if (!actor) return;
  // The defender's owner decides whether to spend Iron or use their Shield.
  const owner = game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  if (owner) {
    if (owner.id === game.user.id) return damageDialog(actor, amount, attackerName);
    return socketRequest("damageDialog", { uuid: actor.uuid, amount, attackerName }, owner.id);
  }
  if (game.user.isGM) return damageDialog(actor, amount, attackerName);
  return socketRequest("damageDialog", { uuid: actor.uuid, amount, attackerName });
}

export async function damageDialog(actor, amount = 1, attackerName = "") {
  const s = actor.system;
  const content = `
    <div class="patd-dmg-dialog">
      <p><b>${esc(actor.name)}</b> is hit${attackerName ? ` by <b>${esc(attackerName)}</b>` : ""}.</p>
      <label>Damage <input type="number" name="amount" value="${amount}" min="0"></label>
      <label>Source <select name="source">
        <option value="action">Action / Ability</option><option value="burning">Burning</option>
        <option value="fall">Fall / Pit</option><option value="trap">Trap</option><option value="super">Super Move</option><option value="cost">HP cost (not damage)</option>
      </select></label>
      <label><input type="checkbox" name="useIron" ${s.tokens.iron ? "" : "disabled"}> Reduce with 1 Iron token (${s.tokens.iron} held)</label>
      <label><input type="checkbox" name="useShield" ${s.shield.value ? "checked" : "disabled"}> Block with Shield (${s.shield.value})</label>
      <label><input type="checkbox" name="unblockableArmor"> Unblockable by Armor</label>
      <p class="patd-note">Armor sources active: ${actor.armorSources}${s.armor.temporary ? " + temporary" : ""}. Triggers used this turn: ${s.armor.triggers}.</p>
    </div>`;
  const res = await DialogV2.prompt({
    window: { title: `Damage: ${actor.name}` }, classes: ["patd-dialog"], content,
    ok: { label: "Apply", icon: "fa-solid fa-burst", callback: (e, button) => {
      const f = button.form.elements;
      return { amount: Number(f.amount.value), source: f.source.value, useIron: f.useIron.checked, useShield: f.useShield.checked, unblockableArmor: f.unblockableArmor.checked };
    } },
    rejectClose: false
  });
  if (!res) return;
  return actor.applyDamage(res.amount, { ...res, attackerName });
}
