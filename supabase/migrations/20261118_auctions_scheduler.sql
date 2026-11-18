-- Aplicar DESPUÉS de 20261118_auctions.sql en Supabase SQL Editor.
-- El trabajo se ejecuta en el servidor, incluso sin visitantes ni sesiones abiertas.
-- Las pujas vencen exactamente a ends_at; la adjudicación se procesa en el
-- siguiente ciclo automático (normalmente menos de un minuto).
begin;
create extension if not exists pg_cron with schema pg_catalog;
do $$
declare job bigint;
begin
 if to_regprocedure('public.auction_close_due()') is null then raise exception 'Aplicá primero 20261118_auctions.sql.';end if;
 job:=cron.schedule('uml-auctions-close','* * * * *','select public.auction_close_due();');
 perform cron.alter_job(job,active:=true);
 if not public.auction_scheduler_ready() then raise exception 'No se pudo habilitar el cierre automático. Revisá Supabase → Integrations → Cron.';end if;
end $$;
commit;
-- Comprobación: debe devolver true.
select public.auction_scheduler_ready() as cierre_automatico_configurado;
