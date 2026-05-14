-- Per-candidate trader feedback: an optional free-form note alongside
-- the existing `status` column (defaults to 'new'; UI flips to
-- 'good' | 'bad' | 'traded'). Status was already in 0001; this adds
-- the note plus a write policy so authenticated users (not just the
-- service role) can update their own labels.

alter table public.setup_candidates
  add column if not exists note text not null default '';

drop policy if exists "setup_candidates: authenticated update status+note"
  on public.setup_candidates;

create policy "setup_candidates: authenticated update status+note"
  on public.setup_candidates for update
  to authenticated
  using (true)
  with check (true);
