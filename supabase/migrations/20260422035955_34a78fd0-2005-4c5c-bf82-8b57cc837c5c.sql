-- Enable realtime for profiles so SuspensionGuard receives is_suspended updates instantly
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;