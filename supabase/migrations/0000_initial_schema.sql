-- ========================================================
-- 1. LIMPEZA DO BANCO E EXTENSÕES
-- ========================================================
drop table if exists public.consultations cascade;
drop table if exists public.appointments cascade;
drop table if exists public.patients cascade;
drop table if exists public.services cascade;
drop table if exists public.clinic_members cascade;
drop table if exists public.clinics cascade;
drop table if exists public.profiles cascade;
drop table if exists public.professionals cascade; -- Antiga

create extension if not exists "uuid-ossp";

-- ========================================================
-- 2. CRIAÇÃO DAS TABELAS (MULTI-TENANT / CLÍNICAS)
-- ========================================================

-- Perfil de Usuário (Estendendo auth.users)
create table public.profiles (
    id uuid references auth.users on delete cascade not null primary key,
    full_name text not null,
    crn text, -- Pode ser nulo se for secretária
    phone text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Clínicas / Consultórios (O "Workspace" central)
create table public.clinics (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    owner_id uuid references public.profiles(id) on delete cascade not null,
    plan_level text default 'starter' not null check (plan_level in ('starter', 'pro')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Membros da Clínica (RBAC - Role Based Access Control)
create table public.clinic_members (
    id uuid default gen_random_uuid() primary key,
    clinic_id uuid references public.clinics(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    role text not null check (role in ('owner', 'nutritionist', 'secretary')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(clinic_id, user_id) -- Um usuário não pode ser duplicado na mesma clínica
);

-- ========================================================
-- 3. CRIAÇÃO DAS TABELAS DE DOMÍNIO
-- ========================================================

-- Tabela de Serviços/Procedimentos (Agora pertence à clínica)
create table public.services (
    id uuid default gen_random_uuid() primary key,
    clinic_id uuid references public.clinics(id) on delete cascade not null,
    name text not null,
    duration_minutes integer not null check (duration_minutes > 0),
    price numeric(10,2) not null check (price >= 0),
    modality text not null check (modality in ('presencial', 'online', 'hibrido')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Pacientes (CRM) (Agora pertence à clínica)
create table public.patients (
    id uuid default gen_random_uuid() primary key,
    clinic_id uuid references public.clinics(id) on delete cascade not null,
    name text not null,
    cpf text,
    email text,
    phone text,
    birth_date date,
    main_goal text,
    status text default 'ativo' not null check (status in ('ativo', 'inativo')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Agendamentos (Agora pertence à clínica e referencia o nutri)
create table public.appointments (
    id uuid default gen_random_uuid() primary key,
    clinic_id uuid references public.clinics(id) on delete cascade not null,
    patient_id uuid references public.patients(id) on delete cascade not null,
    nutritionist_id uuid references public.profiles(id) on delete cascade not null,
    service_id uuid references public.services(id) on delete set null,
    date_time timestamp with time zone not null,
    status text default 'pendente' not null check (status in ('pendente', 'confirmado', 'concluido', 'cancelado')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Consultas / Prontuário (Agora pertence à clínica para facilitar RLS)
create table public.consultations (
    id uuid default gen_random_uuid() primary key,
    clinic_id uuid references public.clinics(id) on delete cascade not null,
    appointment_id uuid references public.appointments(id) on delete cascade not null unique,
    patient_id uuid references public.patients(id) on delete cascade not null,
    anamnese_notes text,
    anthropometry_json jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ========================================================
-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
-- ========================================================
alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.services enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.consultations enable row level security;

-- ========================================================
-- 5. POLÍTICAS DE SEGURANÇA (RLS POLICIES)
-- ========================================================

-- Perfil: O próprio usuário pode gerenciar
create policy "Usuários gerenciam o próprio perfil" 
    on public.profiles for all using (auth.uid() = id);

-- Clínicas: Qualquer membro da clínica pode ver sua clínica
create policy "Membros veem sua clínica" 
    on public.clinics for select using (
        exists (select 1 from public.clinic_members where clinic_id = id and user_id = auth.uid())
    );

-- Membros: Podem ver outros membros da mesma clínica
create policy "Membros veem a equipe da clínica" 
    on public.clinic_members for select using (
        exists (select 1 from public.clinic_members cm2 where cm2.clinic_id = clinic_id and cm2.user_id = auth.uid())
    );

-- Pacientes e Agendamentos: Todos os membros (owner, nutri, secretary) têm acesso total
create policy "Equipe gerencia pacientes" 
    on public.patients for all using (
        exists (select 1 from public.clinic_members where clinic_id = patients.clinic_id and user_id = auth.uid())
    );

create policy "Equipe gerencia agendamentos" 
    on public.appointments for all using (
        exists (select 1 from public.clinic_members where clinic_id = appointments.clinic_id and user_id = auth.uid())
    );

-- Serviços: Todos veem, mas só owner e nutri podem criar/editar/deletar
create policy "Equipe visualiza serviços" 
    on public.services for select using (
        exists (select 1 from public.clinic_members where clinic_id = services.clinic_id and user_id = auth.uid())
    );

create policy "Apenas Nutri e Owner gerenciam serviços" 
    on public.services for insert with check (
        exists (select 1 from public.clinic_members where clinic_id = services.clinic_id and user_id = auth.uid() and role in ('owner', 'nutritionist'))
    );
create policy "Apenas Nutri e Owner atualizam serviços" 
    on public.services for update using (
        exists (select 1 from public.clinic_members where clinic_id = services.clinic_id and user_id = auth.uid() and role in ('owner', 'nutritionist'))
    );
create policy "Apenas Nutri e Owner deletam serviços" 
    on public.services for delete using (
        exists (select 1 from public.clinic_members where clinic_id = services.clinic_id and user_id = auth.uid() and role in ('owner', 'nutritionist'))
    );

-- Consultas (Prontuário): APENAS Nutri e Owner podem ver/criar/editar
create policy "Somente Nutri e Owner acessam prontuários" 
    on public.consultations for all using (
        exists (select 1 from public.clinic_members where clinic_id = consultations.clinic_id and user_id = auth.uid() and role in ('owner', 'nutritionist'))
    );
