-- Stores body progression notes and links each checkpoint to its private photo rows.
alter table public.progress_tracks
  add column if not exists body_checkpoints jsonb not null default '[]'::jsonb;

alter table public.progress_tracks
  drop constraint if exists progress_tracks_body_checkpoints_array_check;

alter table public.progress_tracks
  add constraint progress_tracks_body_checkpoints_array_check
  check (jsonb_typeof(body_checkpoints) = 'array');
