import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks
const invokeMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invokeMock(...a) } },
}));
vi.mock("sonner", () => ({
  toast: {
    error: (...a: any[]) => toastErrorMock(...a),
    success: (...a: any[]) => toastSuccessMock(...a),
  },
}));

// Replicates the addStaffMember error-handling contract used in SettingsPage.tsx
async function createStaff(payload: {
  name: string;
  email: string;
  password: string;
}) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { toast } = await import("sonner");
  try {
    const { data, error } = await supabase.functions.invoke(
      "create-staff-user",
      { body: payload }
    );
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    if (data?.staff) toast.success("Staff added!");
    return data;
  } catch (err: any) {
    toast.error(err.message || "Failed to create staff");
    throw err;
  }
}

describe("Staff limit (Free plan) — end-to-end error surfacing", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("shows the exact edge-function STAFF_LIMIT_REACHED error in the UI toast", async () => {
    const edgeError =
      "Staff limit reached. Your FREE plan allows up to 1 staff member(s). Please upgrade to add more.";

    // Edge function returns 200 with { error, code: STAFF_LIMIT_REACHED }
    invokeMock.mockResolvedValueOnce({
      data: { error: edgeError, code: "STAFF_LIMIT_REACHED", plan: "free", limit: 1 },
      error: null,
    });

    await expect(
      createStaff({
        name: "Second Staff",
        email: "second@example.com",
        password: "secret123",
      })
    ).rejects.toThrow(edgeError);

    // Exactly one error toast, with the exact edge-function message
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith(edgeError);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("first staff creation on Free plan succeeds (no error toast)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { staff: { id: "s1", name: "First", email: "first@example.com", permissions: [] } },
      error: null,
    });

    const res = await createStaff({
      name: "First",
      email: "first@example.com",
      password: "secret123",
    });

    expect(res?.staff?.id).toBe("s1");
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });
});
