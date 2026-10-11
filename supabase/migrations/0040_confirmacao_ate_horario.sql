-- ============================================================================
-- Migration 0040 — Confirmar/desmarcar só até o horário da consulta
-- ============================================================================
--
-- Antes (0022) o link de confirmação valia até 2 dias DEPOIS da consulta, e
-- a confirmação era aceita nesse intervalo — o paciente podia "confirmar
-- presença" numa consulta que já tinha acontecido.
--
-- Agora confirm_appointment_public só aceita enquanto a consulta não começou.
-- O token continua valendo até date_time + 2 dias para get_appointment_details_public
-- (o link abre e mostra que o horário passou, em vez de "link inválido").
--
-- Vale para os três caminhos, que passam todos por esta função: página
-- /confirmar/:token, botão do WhatsApp e resposta digitada (whatsapp_register_reply
-- devolve 'expired' nesse caso).
-- ============================================================================

begin;

create or replace function public.confirm_appointment_public(p_token uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
    v_current_status text;
    v_date_time timestamptz;
begin
    if p_status not in ('confirmado', 'cancelado') then
        return false;
    end if;

    select a.id, a.status, a.date_time
      into v_id, v_current_status, v_date_time
    from public.appointments a
    where a.public_token = p_token
      and (a.public_token_expires_at is null or a.public_token_expires_at > now());

    if v_id is null then
        return false;                    -- token inexistente ou expirado
    end if;

    if v_current_status <> 'pendente' then
        return false;                    -- uso único: já confirmado/cancelado/concluído
    end if;

    if v_date_time <= now() then
        return false;                    -- horário da consulta já passou
    end if;

    update public.appointments
    set status = p_status
    where id = v_id;

    return true;
end;
$$;

revoke all on function public.confirm_appointment_public(uuid, text) from public;
grant execute on function public.confirm_appointment_public(uuid, text) to anon, authenticated;

commit;
