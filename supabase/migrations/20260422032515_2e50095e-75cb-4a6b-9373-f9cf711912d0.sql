-- Add suspension support to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

-- Helper: check if a given owner_id (or current staff's owner) is suspended
CREATE OR REPLACE FUNCTION public.is_user_suspended(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = _user_id), false)
$$;

-- Helper: returns true if current auth.uid() is suspended OR their owner is suspended (for staff)
CREATE OR REPLACE FUNCTION public.is_current_account_suspended()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_user_suspended(auth.uid())
    OR COALESCE(public.is_user_suspended(public.get_staff_owner_id()), false)
$$;

-- Allow staff to read their owner's profile so frontend can detect suspension
DROP POLICY IF EXISTS "Staff can view owner profile" ON public.profiles;
CREATE POLICY "Staff can view owner profile"
ON public.profiles FOR SELECT
USING (id = public.get_staff_owner_id());

-- Allow users to read their own profile (in case it's missing)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Allow admins to view and update all profiles (for suspend toggle)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
ON public.profiles FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));