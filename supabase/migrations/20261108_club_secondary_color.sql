-- Segundo color del club: el borde de las fichas de Formación.
-- El blanco mantiene el aspecto actual hasta que el administrador lo cambie.
begin;
alter table public.clubs add column if not exists secondary_color text not null default '#ffffff'
  constraint clubs_secondary_color_hex check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');
commit;
