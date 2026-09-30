-- ============================================================================
-- Migration 0026 — Módulo Financeiro (fase 1)
-- ============================================================================
--
-- Duas tabelas novas:
--
--   payments  — cobranças/recebimentos. Nascem AUTOMATICAMENTE ao agendar
--               (trigger em `appointments`), com o preço do serviço congelado
--               no momento (mudar o preço do serviço depois não reescreve o
--               histórico). Também aceitam lançamento manual (appointment_id
--               nulo) — ex.: consultas antigas, venda avulsa.
--   expenses  — despesas do consultório, com série mensal opcional
--               (series_id agrupa as parcelas de uma recorrência).
--
-- Permissões (decisão de produto — "secretária só recebe"):
--   payments  → qualquer membro ativo da clínica lê, cria e registra
--               pagamento; só owner/nutritionist excluem.
--   expenses  → só owner/nutritionist (despesas e resultado não aparecem
--               para a secretária).
--
-- Sincronia com a agenda (trigger AFTER em appointments):
--   INSERT                      → cria cobrança 'pendente' (valor do serviço).
--   status → 'cancelado'        → cobrança 'pendente' vira 'cancelado'.
--   status sai de 'cancelado'   → cobrança 'cancelado' volta a 'pendente'.
--   date_time / service / nutri → atualiza a cobrança ainda 'pendente'.
--   DELETE do agendamento       → apaga a cobrança se não estiver paga; se
--                                 estiver paga, o recibo sobrevive
--                                 (appointment_id vira NULL pela FK).
--
-- Backfill: só agendamentos não cancelados a partir do mês corrente. Meses
-- anteriores provavelmente já foram recebidos fora do sistema — gerar
-- pendências retroativas criaria inadimplência falsa. Quem quiser registrar
-- histórico usa o lançamento manual.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. payments
-- ----------------------------------------------------------------------------
create table public.payments (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    patient_id uuid not null references public.patients(id) on delete cascade,
    appointment_id uuid unique references public.appointments(id) on delete set null,
    service_id uuid references public.services(id) on delete set null,
    nutritionist_id uuid references public.profiles(id) on delete set null,
    description text not null,
    amount numeric(10,2) not null check (amount >= 0),
    discount numeric(10,2) not null default 0 check (discount >= 0),
    net_amount numeric(10,2) generated always as (amount - discount) stored,
    status text not null default 'pendente'
        check (status in ('pendente', 'pago', 'cancelado')),
    method text
        check (method in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro')),
    due_date date not null,
    paid_at date,
    notes text,
    created_by uuid references public.profiles(id) on delete set null default auth.uid(),
    created_at timestamptz not null default now(),
    constraint payments_discount_le_amount check (discount <= amount),
    constraint payments_paid_consistency check (
        (status = 'pago' and paid_at is not null and method is not null)
        or (status <> 'pago' and paid_at is null)
    )
);

create index payments_clinic_due_idx on public.payments (clinic_id, due_date);
create index payments_clinic_paid_idx on public.payments (clinic_id, paid_at) where paid_at is not null;
create index payments_patient_idx on public.payments (patient_id);

alter table public.payments enable row level security;

create policy "payments_team_select"
    on public.payments for select to authenticated
    using (public.acting_member_of(clinic_id));

create policy "payments_team_insert"
    on public.payments for insert to authenticated
    with check (
        public.acting_member_of(clinic_id)
        and public.patient_in_clinic(patient_id, clinic_id)
    );

create policy "payments_team_update"
    on public.payments for update to authenticated
    using (public.acting_member_of(clinic_id))
    with check (
        public.acting_member_of(clinic_id)
        and public.patient_in_clinic(patient_id, clinic_id)
    );

create policy "payments_clinical_delete"
    on public.payments for delete to authenticated
    using (public.acting_member_of(clinic_id, array['owner','nutritionist']));

-- ----------------------------------------------------------------------------
-- 2. expenses
-- ----------------------------------------------------------------------------
create table public.expenses (
    id uuid primary key default gen_random_uuid(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    description text not null,
    category text not null default 'outros'
        check (category in ('aluguel', 'software', 'marketing', 'impostos', 'material', 'pessoal', 'servicos', 'outros')),
    amount numeric(10,2) not null check (amount > 0),
    status text not null default 'pendente' check (status in ('pendente', 'pago')),
    due_date date not null,
    paid_at date,
    series_id uuid,
    notes text,
    created_by uuid references public.profiles(id) on delete set null default auth.uid(),
    created_at timestamptz not null default now(),
    constraint expenses_paid_consistency check (
        (status = 'pago' and paid_at is not null) or (status = 'pendente' and paid_at is null)
    )
);

create index expenses_clinic_due_idx on public.expenses (clinic_id, due_date);
create index expenses_series_idx on public.expenses (series_id) where series_id is not null;

alter table public.expenses enable row level security;

create policy "expenses_clinical_all"
    on public.expenses for all to authenticated
    using (public.acting_member_of(clinic_id, array['owner','nutritionist']))
    with check (public.acting_member_of(clinic_id, array['owner','nutritionist']));

-- ----------------------------------------------------------------------------
-- 3. Sincronia agenda → cobrança
--    SECURITY DEFINER: a cobrança é efeito colateral do agendamento, que já
--    passou pela RLS de appointments. Assim a trigger não depende do papel de
--    quem agenda.
-- ----------------------------------------------------------------------------
create or replace function public.sync_appointment_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_price numeric(10,2);
    v_name text;
begin
    if tg_op = 'DELETE' then
        delete from public.payments
        where appointment_id = old.id and status <> 'pago';
        return old;
    end if;

    if new.service_id is not null then
        select price, name into v_price, v_name
        from public.services where id = new.service_id;
    end if;

    if tg_op = 'INSERT' then
        insert into public.payments (
            clinic_id, patient_id, appointment_id, service_id, nutritionist_id,
            description, amount, status, due_date, created_by
        ) values (
            new.clinic_id, new.patient_id, new.id, new.service_id, new.nutritionist_id,
            coalesce(v_name, 'Atendimento'), coalesce(v_price, 0),
            case when new.status = 'cancelado' then 'cancelado' else 'pendente' end,
            (new.date_time at time zone 'America/Sao_Paulo')::date,
            auth.uid()
        )
        on conflict (appointment_id) do nothing;
        return new;
    end if;

    -- UPDATE
    if new.status = 'cancelado' and old.status <> 'cancelado' then
        update public.payments set status = 'cancelado'
        where appointment_id = new.id and status = 'pendente';
    elsif old.status = 'cancelado' and new.status <> 'cancelado' then
        update public.payments set status = 'pendente'
        where appointment_id = new.id and status = 'cancelado';
    end if;

    if new.date_time is distinct from old.date_time
       or new.service_id is distinct from old.service_id
       or new.nutritionist_id is distinct from old.nutritionist_id
       or new.patient_id is distinct from old.patient_id then
        update public.payments set
            due_date = (new.date_time at time zone 'America/Sao_Paulo')::date,
            nutritionist_id = new.nutritionist_id,
            patient_id = new.patient_id,
            service_id = new.service_id,
            -- Valor só é reescrito se o serviço mudou; preço congelado nos demais casos.
            description = case when new.service_id is distinct from old.service_id
                               then coalesce(v_name, 'Atendimento') else description end,
            amount = case when new.service_id is distinct from old.service_id
                          then coalesce(v_price, 0) else amount end,
            discount = case when new.service_id is distinct from old.service_id
                            then least(discount, coalesce(v_price, 0)) else discount end
        where appointment_id = new.id and status <> 'pago';
    end if;

    return new;
end;
$$;

revoke execute on function public.sync_appointment_payment() from anon, authenticated, public;

create trigger trg_sync_appointment_payment_ins
    after insert on public.appointments
    for each row execute function public.sync_appointment_payment();

create trigger trg_sync_appointment_payment_upd
    after update of status, date_time, service_id, nutritionist_id, patient_id on public.appointments
    for each row execute function public.sync_appointment_payment();

create trigger trg_sync_appointment_payment_del
    before delete on public.appointments
    for each row execute function public.sync_appointment_payment();

-- ----------------------------------------------------------------------------
-- 4. Backfill (a partir do mês corrente — ver cabeçalho)
-- ----------------------------------------------------------------------------
insert into public.payments (
    clinic_id, patient_id, appointment_id, service_id, nutritionist_id,
    description, amount, status, due_date, created_by
)
select a.clinic_id, a.patient_id, a.id, a.service_id, a.nutritionist_id,
       coalesce(s.name, 'Atendimento'), coalesce(s.price, 0), 'pendente',
       (a.date_time at time zone 'America/Sao_Paulo')::date, null
from public.appointments a
left join public.services s on s.id = a.service_id
where a.status <> 'cancelado'
  and a.date_time >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
on conflict (appointment_id) do nothing;

commit;

-- ============================================================================
-- Verificação:
--   1. Agendar consulta → aparece cobrança 'pendente' com o preço do serviço.
--   2. Cancelar a consulta → cobrança 'cancelado'. Reagendar → due_date muda.
--   3. Registrar pagamento como secretária → OK. Excluir cobrança como
--      secretária → 0 linhas. Ler `expenses` como secretária → vazio.
--   4. Excluir consulta com cobrança paga → recibo continua (appointment_id nulo).
--
-- Rollback:
--   drop trigger trg_sync_appointment_payment_ins on public.appointments;
--   drop trigger trg_sync_appointment_payment_upd on public.appointments;
--   drop trigger trg_sync_appointment_payment_del on public.appointments;
--   drop function public.sync_appointment_payment();
--   drop table public.expenses; drop table public.payments;
-- ============================================================================
