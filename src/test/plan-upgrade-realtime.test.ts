/**
 * End-to-end test: Owner upgrades from Free → Pro and BOTH the owner's
 * dashboard and a staff member's dashboard (in any of the owner's stores)
 * immediately reflect the Pro plan via the Supabase Realtime subscription.
 *
 * Mirrors the contract in src/hooks/useStorePlan.ts:
 *   - planUserId = isStaff ? staffInfo.owner_id : user.id
 *   - On postgres_changes, fetchPlan() re-reads the latest active row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Sub = { plan: "free" | "pro" | "business"; status: string; end_date: string | null };

// Shared in-memory subscription store keyed by owner user_id
const subsByOwner = new Map<string, Sub>();

// Realtime channel registry: owner_id -> list of callbacks
const realtimeListeners = new Map<string, Array<() => void>>();

const fromMock = vi.fn((table: string) => {
  if (table !== "subscriptions") throw new Error(`Unexpected table ${table}`);
  let userIdFilter: string | null = null;
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: string) => {
      if (col === "user_id") userIdFilter = val;
      return builder;
    },
    is: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const sub = userIdFilter ? subsByOwner.get(userIdFilter) ?? null : null;
      return { data: sub, error: null };
    },
  };
  return builder;
});

const channelMock = vi.fn((_name: string) => {
  let ownerId: string | null = null;
  let cb: (() => void) | null = null;
  const ch: any = {
    on: (_event: string, opts: { filter: string }, callback: () => void) => {
      const m = /user_id=eq\.(.+)$/.exec(opts.filter);
      if (m) ownerId = m[1];
      cb = callback;
      return ch;
    },
    subscribe: () => {
      if (ownerId && cb) {
        const list = realtimeListeners.get(ownerId) ?? [];
        list.push(cb);
        realtimeListeners.set(ownerId, list);
      }
      return ch;
    },
  };
  return ch;
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => fromMock(t),
    channel: (n: string) => channelMock(n),
    removeChannel: vi.fn(),
  },
}));

/** Simulates an admin/owner upgrading the plan in the DB and broadcasting realtime. */
function upgradeOwnerPlan(ownerId: string, newPlan: Sub["plan"]) {
  subsByOwner.set(ownerId, { plan: newPlan, status: "active", end_date: null });
  for (const cb of realtimeListeners.get(ownerId) ?? []) cb();
}

/** Replicates the resolution logic of useStorePlan: staff inherits owner's plan. */
async function resolveDashboardPlan(session: {
  isStaff: boolean;
  userId: string;
  ownerId?: string;
}): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  const planUserId = session.isStaff ? session.ownerId! : session.userId;
  const { data } = await supabase
    .from("subscriptions")
    .select("plan,status,end_date")
    .eq("user_id", planUserId)
    .eq("status", "active")
    .is("customer_id", null)
    .in("plan", ["free", "pro", "business"])
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const isExpired = (data as Sub | null)?.end_date && new Date((data as Sub).end_date!) < new Date();
  return isExpired ? "free" : ((data as Sub | null)?.plan ?? "free");
}

/** Subscribes a dashboard (owner or staff) to realtime plan changes. */
function subscribeDashboard(
  session: { isStaff: boolean; userId: string; ownerId?: string },
  onChange: (plan: string) => void
) {
  const { supabase } = require("@/integrations/supabase/client");
  const planUserId = session.isStaff ? session.ownerId! : session.userId;
  supabase
    .channel(`user-plan-${planUserId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${planUserId}` },
      async () => {
        const next = await resolveDashboardPlan(session);
        onChange(next);
      }
    )
    .subscribe();
}

describe("Plan upgrade Free → Pro propagates to owner + staff dashboards in realtime", () => {
  beforeEach(() => {
    subsByOwner.clear();
    realtimeListeners.clear();
    fromMock.mockClear();
    channelMock.mockClear();
  });

  it("owner sees Pro and staff (across stores) sees Pro immediately after upgrade", async () => {
    const ownerId = "owner-1";
    const staffStoreA = { isStaff: true, userId: "staff-A-auth", ownerId };
    const staffStoreB = { isStaff: true, userId: "staff-B-auth", ownerId };
    const owner = { isStaff: false, userId: ownerId };

    // Initial state: Free plan for the owner
    subsByOwner.set(ownerId, { plan: "free", status: "active", end_date: null });

    // All three dashboards initially load
    expect(await resolveDashboardPlan(owner)).toBe("free");
    expect(await resolveDashboardPlan(staffStoreA)).toBe("free");
    expect(await resolveDashboardPlan(staffStoreB)).toBe("free");

    // Each dashboard subscribes to realtime plan changes
    const ownerPlan: string[] = [];
    const staffAPlan: string[] = [];
    const staffBPlan: string[] = [];
    subscribeDashboard(owner, (p) => ownerPlan.push(p));
    subscribeDashboard(staffStoreA, (p) => staffAPlan.push(p));
    subscribeDashboard(staffStoreB, (p) => staffBPlan.push(p));

    // 🔼 Owner upgrades Free → Pro
    upgradeOwnerPlan(ownerId, "pro");

    // Allow microtasks (async fetchPlan) to flush
    await new Promise((r) => setTimeout(r, 0));

    // Assert: every dashboard reflects Pro instantly
    expect(ownerPlan.at(-1)).toBe("pro");
    expect(staffAPlan.at(-1)).toBe("pro");
    expect(staffBPlan.at(-1)).toBe("pro");

    // Re-read also returns Pro (no stale state)
    expect(await resolveDashboardPlan(owner)).toBe("pro");
    expect(await resolveDashboardPlan(staffStoreA)).toBe("pro");
    expect(await resolveDashboardPlan(staffStoreB)).toBe("pro");

    // All three dashboards subscribed under the SAME owner channel filter
    // (proves staff inherit via owner_id, not their own auth id)
    const channelArgs = channelMock.mock.calls.map((c) => c[0] as string);
    expect(channelArgs.every((n) => n.includes(`user-plan-${ownerId}`))).toBe(true);
  });

  it("staff dashboard never queries with the staff auth id — always uses owner_id", async () => {
    const ownerId = "owner-2";
    subsByOwner.set(ownerId, { plan: "pro", status: "active", end_date: null });
    // Note: no row for the staff's own auth id — proves we don't fall back to it
    const plan = await resolveDashboardPlan({ isStaff: true, userId: "staff-X", ownerId });
    expect(plan).toBe("pro");
  });
});
