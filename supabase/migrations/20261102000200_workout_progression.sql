-- Workout logs reuse the account-owned Progress track and RLS structure.
alter table public.progress_tracks
  drop constraint if exists progress_tracks_kind_check;

alter table public.progress_tracks
  add constraint progress_tracks_kind_check
  check (kind in ('skin', 'supplement', 'workout'));

alter table public.progress_tracks
  add column if not exists workout_sessions jsonb not null default '[]'::jsonb;

alter table public.progress_tracks
  drop constraint if exists progress_tracks_workout_sessions_array_check;

alter table public.progress_tracks
  add constraint progress_tracks_workout_sessions_array_check
  check (jsonb_typeof(workout_sessions) = 'array');

create index if not exists progress_tracks_workout_kind_idx
  on public.progress_tracks(user_id, created_at desc)
  where kind = 'workout';
