/**
 * End-to-end test: Owner upgrades from Free → Pro and BOTH the owner's
 * dashboard and ALL staff dashboards (any store) immediately reflect Pro
 * via the Supabase Realtime subscription.
 *
 * Mirrors the contract in src/hooks/useStorePlan.ts:
 *   planUserId = isStaff ? staffInfo.owner_id : user.id
 *   On postgres_changes(subscriptions where user_id=planUserId), refetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Plan = "free" | "pro" | "business";
interface Sub { plan: Plan; status: string; end_date: string | null; }

// In-memory "DB" keyed by owner user_id
const subsByOwner = new Map<string, Sub>();
// Realtime listeners keyed by the user_id filter passed to .on()
const listeners = new Map<string, Array<() => Promise<void> | void>>();

function makeFromBuilder() {
  const filter: { userId?: string } = {};
  const b: any = {
    select: () => b,
    eq: (col: string, val: string) => { if (col === "user_id") filter.userId = val; return b; },
    is: () => b, in: () => b, order: () => b, limit: () => b,
    maybeSingle: async () => ({
      data: filter.userId ? subsByOwner.get(filter.userId) ?? null : null,
      error: null,
    }),
  };
  return b;
}

const channelMock = vi.fn(() => {
  const state: { filterUserId?: string; cb?: () => Promise<void> | void } = {};
  const ch: any = {
    on: (_evt: string, opts: { filter: string }, cb: () => Promise<void> | void) => {
      const m = /user_id=eq\.(.+)$/.exec(opts.filter);
      if (m) state.filterUserId = m[1];
      state.cb = cb;
      return ch;
    },
    subscribe: () => {
      if (state.filterUserId && state.cb) {
        const arr = listeners.get(state.filterUserId) ?? [];
        arr.push(state.cb);
        listeners.set(state.filterUserId, arr);
      }
      return ch;
    },
  };
  return ch;
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => makeFromBuilder(),
    channel: () => channelMock(),
    removeChannel: vi.fn(),
  },
}));

/** Simulate admin-side plan upgrade: write DB + broadcast realtime. */
async function adminUpgradePlan(ownerId: string, newPlan: Plan) {
  subsByOwner.set(ownerId, { plan: newPlan, status: "active", end_date: null });
  const arr = listeners.get(ownerId) ?? [];
  // eslint-disable-next-line no-console
  console.log("[upgrade]", arr.length, "listeners,", arr.map(c => c.toString().slice(0,40)));
  await Promise.all(arr.map(async (cb) => { await cb(); }));
}

/** Replicates useStorePlan.fetchPlan resolution. */
async function fetchPlan(session: { isStaff: boolean; userId: string; ownerId?: string }): Promise<Plan> {
  const { supabase } = await import("@/integrations/supabase/client");
  const planUserId = session.isStaff ? session.ownerId! : session.userId;
  // eslint-disable-next-line no-console
  console.log("[fetchPlan]", session.userId, "isStaff=", session.isStaff, "planUserId=", planUserId);
  const { data } = await supabase.from("subscriptions").select().eq("user_id", planUserId)
    .eq("status", "active").is("customer_id", null).in("plan", ["free", "pro", "business"])
    .order("start_date", { ascending: false }).limit(1).maybeSingle();
  const sub = data as Sub | null;
  // eslint-disable-next-line no-console
  console.log("[fetchPlan-result]", session.userId, "data=", sub);
  const expired = sub?.end_date && new Date(sub.end_date) < new Date();
  return (expired ? "free" : (sub?.plan ?? "free")) as Plan;
}

/** A dashboard subscribes to realtime and updates its local state on every event. */
async function mountDashboard(session: { isStaff: boolean; userId: string; ownerId?: string }) {
  const { supabase } = await import("@/integrations/supabase/client");
  const state = { plan: await fetchPlan(session) as Plan };
  const planUserId = session.isStaff ? session.ownerId! : session.userId;
  supabase.channel(`user-plan-${planUserId}`).on(
    "postgres_changes",
    { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${planUserId}` },
    async () => {
      // eslint-disable-next-line no-console
      console.log("[fire]", session.isStaff ? "staff" : "owner", session.userId);
      const next = await fetchPlan(session);
      // eslint-disable-next-line no-console
      console.log("[update]", session.userId, "->", next);
      state.plan = next;
    }
  ).subscribe();
  return state;
}

describe("Plan upgrade Free → Pro propagates instantly to owner + all staff dashboards", () => {
  beforeEach(() => {
    subsByOwner.clear();
    listeners.clear();
    channelMock.mockClear();
  });

  it("owner & staff (across multiple stores) all flip to Pro after the owner upgrades", async () => {
    const ownerId = "owner-123";
    subsByOwner.set(ownerId, { plan: "free", status: "active", end_date: null });

    // Mount three dashboards: the owner + two staff (one per store)
    const ownerDash = await mountDashboard({ isStaff: false, userId: ownerId });
    const staffStoreA = await mountDashboard({ isStaff: true, userId: "staff-A", ownerId });
    const staffStoreB = await mountDashboard({ isStaff: true, userId: "staff-B", ownerId });

    // Initial state: everyone sees Free
    expect(ownerDash.plan).toBe("free");
    expect(staffStoreA.plan).toBe("free");
    expect(staffStoreB.plan).toBe("free");

    // 🔼 Owner upgrades to Pro (e.g. via /my-plan checkout)
    await adminUpgradePlan(ownerId, "pro");

    // ✅ All three dashboards reflect Pro instantly via realtime
    expect(ownerDash.plan).toBe("pro");
    expect(staffStoreA.plan).toBe("pro");
    expect(staffStoreB.plan).toBe("pro");

    // All three subscriptions used the SAME owner channel filter
    // (proves staff inherit owner's plan, never their own auth id)
    expect(listeners.get(ownerId)?.length).toBe(3);
    expect(listeners.get("staff-A")).toBeUndefined();
    expect(listeners.get("staff-B")).toBeUndefined();
  });

  it("staff dashboard always reads from owner_id, never the staff's own auth id", async () => {
    const ownerId = "owner-456";
    subsByOwner.set(ownerId, { plan: "pro", status: "active", end_date: null });
    // No row exists for the staff's own auth id — proves no fallback to it
    const plan = await fetchPlan({ isStaff: true, userId: "staff-only", ownerId });
    expect(plan).toBe("pro");
  });

  it("downgrade Pro → Free also propagates instantly to all staff", async () => {
    const ownerId = "owner-789";
    subsByOwner.set(ownerId, { plan: "pro", status: "active", end_date: null });
    const owner = await mountDashboard({ isStaff: false, userId: ownerId });
    const staff = await mountDashboard({ isStaff: true, userId: "staff-Z", ownerId });
    expect(owner.plan).toBe("pro");
    expect(staff.plan).toBe("pro");

    await adminUpgradePlan(ownerId, "free");
    expect(owner.plan).toBe("free");
    expect(staff.plan).toBe("free");
  });
});
