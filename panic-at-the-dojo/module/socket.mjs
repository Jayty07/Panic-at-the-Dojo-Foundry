import { SYS } from "./config.mjs";

const CHANNEL = `system.${SYS}`;
const ALLOWED_OPS = new Set(["modToken", "setChallenge", "heal", "gainShield", "applyDamage"]);

/**
 * Send a request to another client. If no user is given, the active GM handles it.
 */
export function socketRequest(action, data, userId = null) {
  const gm = game.users.activeGM;
  const to = userId ?? gm?.id;
  if (!to) { ui.notifications.warn("No GM is connected to resolve that effect."); return; }
  game.socket.emit(CHANNEL, { action, data, to, from: game.user.id });
}

export function registerSocket(handlers) {
  game.socket.on(CHANNEL, async (msg) => {
    if (msg?.to !== game.user.id) return;
    const from = game.users.get(msg.from);
    try {
      switch (msg.action) {
        case "moveToken": {
          const doc = await fromUuid(msg.data.uuid);
          if (!doc?.isOwner) return;
          await doc.update({ x: msg.data.x, y: msg.data.y }, { animate: !msg.data.teleport, teleport: !!msg.data.teleport });
          break;
        }
        case "actorOp": {
          const actor = await fromUuid(msg.data.uuid);
          if (!actor?.isOwner || !ALLOWED_OPS.has(msg.data.op)) return;
          await actor[msg.data.op](...(msg.data.args ?? []));
          break;
        }
        case "damageDialog": {
          const actor = await fromUuid(msg.data.uuid);
          if (!actor?.isOwner) return;
          await handlers.damageDialog(actor, msg.data.amount, msg.data.attackerName ? `${msg.data.attackerName}` : (from?.name ?? ""));
          break;
        }
        case "meter": {
          if (!game.user.isGM) return;
          await handlers.meter?.(msg.data, from);
          break;
        }
      }
    } catch (err) { console.error(`${SYS} | socket`, err); }
  });
}
