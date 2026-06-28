import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface StaffInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  store_id: string | null;
  store_ids: string[];
  owner_id: string; // the user_id of the store owner
  is_active: boolean;
}

interface StaffContextType {
  isStaff: boolean;
  staffInfo: StaffInfo | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  hasAnyPermission: (...perms: string[]) => boolean;
  /** Returns the store owner's user_id for staff, or the current user's id for owners */
  effectiveUserId: string | null;
}

const StaffContext = createContext<StaffContextType>({
  isStaff: false,
  staffInfo: null,
  loading: true,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  effectiveUserId: null,
});

export const useStaff = () => useContext(StaffContext);

export const StaffProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStaff = async () => {
      if (!user) {
        setStaffInfo(null);
        setLoading(false);
        return;
      }

      // Check if this auth user is a staff member
      const { data, error } = await supabase
        .from("staff_members")
        .select("*")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (data && !error) {
        const ids = ((data as any).store_ids as string[] | null) ?? [];
        const merged = Array.from(new Set([
          ...ids,
          ...((data as any).store_id ? [(data as any).store_id as string] : []),
        ]));
        setStaffInfo({
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role,
          permissions: (data.permissions as string[]) ?? [],
          store_id: (data as any).store_id ?? null,
          store_ids: merged,
          owner_id: data.user_id,
          is_active: data.is_active,
        });
      } else {
        setStaffInfo(null);
      }
      setLoading(false);
    };

    checkStaff();

    // Real-time subscription: auto-update permissions when owner edits staff record
    if (!user) return;
    const channel = supabase
      .channel(`staff-perms-${user.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "staff_members",
        filter: `auth_user_id=eq.${user.id}`,
      }, (payload) => {
        const d = payload.new as any;
        if (d.is_active) {
          const ids = (d.store_ids as string[] | null) ?? [];
          const merged = Array.from(new Set([
            ...ids,
            ...(d.store_id ? [d.store_id as string] : []),
          ]));
          setStaffInfo({
            id: d.id,
            name: d.name,
            email: d.email,
            role: d.role,
            permissions: (d.permissions as string[]) ?? [],
            store_id: d.store_id ?? null,
            store_ids: merged,
            owner_id: d.user_id,
            is_active: d.is_active,
          });
        } else {
          setStaffInfo(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const hasPermission = (perm: string): boolean => {
    if (!staffInfo) return true; // not staff = owner = full access
    if (staffInfo.role === "admin") return true;
    return staffInfo.permissions.includes(perm);
  };

  const hasAnyPermission = (...perms: string[]): boolean => {
    if (!staffInfo) return true;
    if (staffInfo.role === "admin") return true;
    return perms.some(p => staffInfo.permissions.includes(p));
  };

  const effectiveUserId = staffInfo ? staffInfo.owner_id : (user?.id ?? null);

  return (
    <StaffContext.Provider value={{
      isStaff: !!staffInfo,
      staffInfo,
      loading,
      hasPermission,
      hasAnyPermission,
      effectiveUserId,
    }}>
      {children}
    </StaffContext.Provider>
  );
};
