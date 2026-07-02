-- ============================================
-- Harden the signup trigger function.
-- Flagged by the Supabase security advisor:
--   - function_search_path_mutable: a SECURITY DEFINER function with a mutable
--     search_path can be hijacked. Pin it to empty and schema-qualify refs.
--   - {anon,authenticated}_security_definer_function_executable: the function
--     was callable via /rest/v1/rpc/handle_new_user. Revoke EXECUTE — it only
--     ever needs to run as the AFTER INSERT trigger on auth.users.
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
