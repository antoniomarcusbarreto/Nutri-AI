-- Migration 0007: Create Reminders Table

create table public.reminders (
    id uuid default gen_random_uuid() primary key,
    clinic_id uuid references public.clinics(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    description text not null,
    due_date date not null,
    is_completed boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.reminders enable row level security;

create policy "Users can view reminders of their clinic"
    on public.reminders for select
    using (clinic_id in (
        select clinic_id from public.clinic_members where user_id = auth.uid()
    ));

create policy "Users can insert reminders for their clinic"
    on public.reminders for insert
    with check (clinic_id in (
        select clinic_id from public.clinic_members where user_id = auth.uid()
    ));

create policy "Users can update their clinic reminders"
    on public.reminders for update
    using (clinic_id in (
        select clinic_id from public.clinic_members where user_id = auth.uid()
    ));

create policy "Users can delete their clinic reminders"
    on public.reminders for delete
    using (clinic_id in (
        select clinic_id from public.clinic_members where user_id = auth.uid()
    ));
