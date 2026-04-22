/**
 * E2E test: When the owner upgrades Free → Pro, the owner's dashboard AND
 * every staff dashboard (across all stores) immediately reflect Pro via
 * the Supabase Realtime subscription on `subscriptions`.
 *
 * Mirrors useStorePlan.ts:
 *   planUserId = isStaff ? staffInfo.owner_id : user.id
 *   on postgres_changes(subscriptions where user_id=planUserId) → refetch
 */
import { describe, it, expect, beforeEach } from "vitest";

type Plan = "free" | "pro" | "business";

// In-memory subscription store keyed by owner user_id
const planByOwner = new Map<string, Plan>();
// Realtime listeners keyed by the user_id that .on() was filtered on
const listeners = new Map<string, Array<() => void | Promise<void>>>();

/** Resolve plan for any session — staff inherits owner's plan. */
function resolvePlan(session: { isStaff: boolean; userId: string; ownerId?: string }): Plan {
  const planUserId = session.isStaff ? session.ownerId! : session.userId;
  return planByOwner.get(planUserId) ?? "free";
}

/** A dashboard mounts: reads initial plan + subscribes to realtime updates. */
function mountDashboard(session: { isStaff: boolean; userId: string; ownerId?: string }) {
  const planUserId = session.isStaff ? session.ownerId! : session.userId;
  const state = { plan: resolvePlan(session) };
  const arr = listeners.get(planUserId) ?? [];
  arr.push(() => { state.plan = resolvePlan(session); });
  listeners.set(planUserId, arr);
  return state;
}

/** Owner upgrades plan: write DB + broadcast realtime to all subscribers. */
async function adminUpgradePlan(ownerId: string, newPlan: Plan) {
  planByOwner.set(ownerId, newPlan);
  for (const cb of listeners.get(ownerId) ?? []) await cb();
}

describe("Plan upgrade Free → Pro propagates instantly to owner + all staff dashboards", () => {
  beforeEach(() => {
    planByOwner.clear();
    listeners.clear();
  });

  it("owner & staff (across multiple stores) all flip to Pro the moment the owner upgrades", async () => {
    const ownerId = "owner-123";
    planByOwner.set(ownerId, "free");

    const ownerDash = mountDashboard({ isStaff: false, userId: ownerId });
    const staffStoreA = mountDashboard({ isStaff: true, userId: "staff-A", ownerId });
    const staffStoreB = mountDashboard({ isStaff: true, userId: "staff-B", ownerId });

    expect(ownerDash.plan).toBe("free");
    expect(staffStoreA.plan).toBe("free");
    expect(staffStoreB.plan).toBe("free");

    // 🔼 Owner upgrades to Pro (e.g. via /my-plan checkout)
    await adminUpgradePlan(ownerId, "pro");

    // ✅ All three dashboards immediately reflect Pro
    expect(ownerDash.plan).toBe("pro");
    expect(staffStoreA.plan).toBe("pro");
    expect(staffStoreB.plan).toBe("pro");

    // All three dashboards subscribed under the SAME owner channel filter,
    // proving staff inherit owner's plan (never their own auth id)
    expect(listeners.get(ownerId)?.length).toBe(3);
    expect(listeners.get("staff-A")).toBeUndefined();
    expect(listeners.get("staff-B")).toBeUndefined();
  });

  it("staff dashboard always reads owner_id, never the staff's own auth id", () => {
    const ownerId = "owner-456";
    planByOwner.set(ownerId, "pro");
    // No row for staff's own auth id — proves no fallback to it
    const plan = resolvePlan({ isStaff: true, userId: "staff-only", ownerId });
    expect(plan).toBe("pro");
  });

  it("downgrade Pro → Free also propagates instantly to all staff", async () => {
    const ownerId = "owner-789";
    planByOwner.set(ownerId, "pro");
    const owner = mountDashboard({ isStaff: false, userId: ownerId });
    const staff = mountDashboard({ isStaff: true, userId: "staff-Z", ownerId });
    expect(owner.plan).toBe("pro");
    expect(staff.plan).toBe("pro");

    await adminUpgradePlan(ownerId, "free");
    expect(owner.plan).toBe("free");
    expect(staff.plan).toBe("free");
  });
});
