-- Row Level Security for Supabase. Applied automatically by `npm run db:migrate`
-- when the target database has an `auth` schema (i.e. Supabase).
-- The app server connects with the database role and also filters every query by user_id;
-- these policies protect the data if you ever query it from the browser with the anon key.
do $$
declare t text;
begin
  foreach t in array array[
    'api_keys','products','searches','leads','lead_phones','lead_emails','lead_people','lead_enrichment',
    'lead_insights','source_records','lists','tags','templates','outreach_log','messages','call_logs','tasks',
    'notes','status_history','suppression_list','jobs','api_usage','audit_log','notifications'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text)', t);
  end loop;
  alter table profiles enable row level security;
  drop policy if exists owner_all on profiles;
  create policy owner_all on profiles for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
end $$;
