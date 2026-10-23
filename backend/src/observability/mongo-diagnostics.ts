import type { MongoClient } from "mongodb";
import { beginRequestTiming } from "../utils/logger";
import { DB_COLLECTIONS, DB_COMMANDS } from "./request-diagnostics";

/** Only command name, allowlisted collection and elapsed time are observed. Never
 * retain query filters, command/reply bodies, connection addresses or documents. */
export function attachMongoDiagnostics(client: MongoClient): void {
  const pending = new Map<number, (failed: boolean) => void>();
  client.on("commandStarted", event => {
    if (!DB_COMMANDS.has(event.commandName) || pending.size >= 2000) return;
    const collection = event.commandName === "getMore" ? event.command.collection : event.command[event.commandName];
    if (collection === "admin_server_errors") return;
    const name = typeof collection === "string" && DB_COLLECTIONS.has(collection) ? collection : "other";
    const finish = beginRequestTiming(`db.${name}.${event.commandName}`);
    if (finish) pending.set(event.requestId, finish);
  });
  const finish = (requestId: number, failed: boolean) => {
    const end = pending.get(requestId);
    pending.delete(requestId);
    end?.(failed);
  };
  client.on("commandSucceeded", event => finish(event.requestId, false));
  client.on("commandFailed", event => finish(event.requestId, true));
}
