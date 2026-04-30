// Offline-first chat outbox.
// Supports 4 kinds: group_message, direct_message, task_comment, support_message.
// Drains sequentially on reconnect. Last-write-wins (no conflict checks).
import { get, set, del, createStore, keys } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const outboxStore = createStore("evixpos-offline-chat", "outbox");

export type OutboxKind =
  | "group_message"
  | "direct_message"
  | "task_comment"
  | "support_message";

export interface OutboxEntry {
  tempId: string;
  kind: OutboxKind;
  createdAt: string;
  // Free-form payload — depends on kind:
  payload: any;
}

export function genChatTempId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueChat(entry: OutboxEntry) {
  await set(entry.tempId, entry, outboxStore);
  notify();
}
export async function listPending(): Promise<OutboxEntry[]> {
  const ks = await keys(outboxStore);
  const out: OutboxEntry[] = [];
  for (const k of ks) {
    const v = await get(k as string, outboxStore);
    if (v) out.push(v as OutboxEntry);
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function removeFromOutbox(tempId: string) {
  await del(tempId, outboxStore);
  notify();
}

async function pushOne(entry: OutboxEntry): Promise<{ ok: boolean; error?: string }> {
  try {
    if (entry.kind === "group_message") {
      const { error } = await (supabase as any).from("chat_group_messages").insert(entry.payload);
      if (error) throw error;
    } else if (entry.kind === "direct_message") {
      const { error } = await (supabase as any).from("staff_messages").insert(entry.payload);
      if (error) throw error;
    } else if (entry.kind === "task_comment") {
      const { error } = await (supabase as any).from("chat_task_comments").insert(entry.payload);
      if (error) throw error;
    } else if (entry.kind === "support_message") {
      const { error } = await (supabase as any).from("support_messages").insert(entry.payload);
      if (error) throw error;
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function drainChatOutbox(): Promise<{ synced: number; failed: number }> {
  const list = await listPending();
  let synced = 0;
  let failed = 0;
  for (const entry of list) {
    const res = await pushOne(entry);
    if (res.ok) {
      await removeFromOutbox(entry.tempId);
      synced++;
    } else {
      failed++;
      break; // preserve order; retry later
    }
  }
  return { synced, failed };
}

// Tiny event bus
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeChatOutbox(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() { listeners.forEach((l) => { try { l(); } catch {} }); }

// ─── Filtered helpers for optimistic UI ───
export async function listPendingFor(filter: (e: OutboxEntry) => boolean): Promise<OutboxEntry[]> {
  const all = await listPending();
  return all.filter(filter);
}
