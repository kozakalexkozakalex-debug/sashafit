-- Три фото в чек-іні: спереду (photo_path, як було), збоку і ззаду.
alter table public.checkins
  add column if not exists photo_side_path text,
  add column if not exists photo_back_path text;
