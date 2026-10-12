-- Run in Supabase SQL Editor as the project owner. Never expose service_role keys.
create extension if not exists pgcrypto;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default 'Member',
 role text not null default 'user' check(role in ('user','admin')),
 created_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(coalesce(new.email,''),'@',1),'Member')) on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.listings(
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(char_length(title) between 2 and 90),
 category text not null check(category in ('Vehicles','Property','Electronics','Home & Kitchen','Fashion','Farming','Other')),
 condition text not null default 'Used' check(condition in ('New','Used','Refurbished')),
 price numeric(12,2) not null check(price>0), quantity integer not null default 1 check(quantity>=0),
 location text, description text check(description is null or char_length(description)<=1200), image_url text,
 status text not null default 'active' check(status in ('active','removed','sold')), created_at timestamptz not null default now()
);
create table if not exists public.orders(
 id uuid primary key default gen_random_uuid(), listing_id uuid references public.listings(id) on delete set null,
 buyer_id uuid not null references public.profiles(id) on delete cascade, seller_id uuid not null references public.profiles(id) on delete cascade,
 quantity integer not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>0), total_price numeric(12,2) not null check(total_price>0),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','completed','cancelled')),
 created_at timestamptz not null default now(), constraint order_not_self check(buyer_id<>seller_id)
);
create table if not exists public.support_messages(
 id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null,
 name text not null check(char_length(name) between 1 and 80), contact text,
 message text not null check(char_length(message) between 1 and 1000),
 status text not null default 'open' check(status in ('open','resolved')), created_at timestamptz not null default now()
);
create index if not exists listings_status_created_idx on public.listings(status,created_at desc);
create index if not exists listings_seller_idx on public.listings(seller_id);
create index if not exists orders_buyer_idx on public.orders(buyer_id,created_at desc);
create index if not exists orders_seller_idx on public.orders(seller_id,created_at desc);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin');
$$;
grant execute on function public.is_admin() to anon,authenticated;

-- Prevent normal users from changing their own role through the public API.
create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change profile roles';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles
for each row execute procedure public.prevent_self_role_change();

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "profiles select signed in" on public.profiles;
create policy "profiles select display names" on public.profiles for select to anon,authenticated using(true);
drop policy if exists "profile update own" on public.profiles;
create policy "profile update own" on public.profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id);

drop policy if exists "listing read" on public.listings;
create policy "listing read" on public.listings for select to anon,authenticated using(status='active' or seller_id=auth.uid() or public.is_admin());
drop policy if exists "listing insert own" on public.listings;
create policy "listing insert own" on public.listings for insert to authenticated with check(seller_id=auth.uid() and status='active');
drop policy if exists "listing update own or admin" on public.listings;
create policy "listing update own or admin" on public.listings for update to authenticated using(seller_id=auth.uid() or public.is_admin()) with check(seller_id=auth.uid() or public.is_admin());
drop policy if exists "listing delete own or admin" on public.listings;
create policy "listing delete own or admin" on public.listings for delete to authenticated using(seller_id=auth.uid() or public.is_admin());

drop policy if exists "order read participant admin" on public.orders;
create policy "order read participant admin" on public.orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid() or public.is_admin());
drop policy if exists "order insert buyer" on public.orders;
create policy "order insert buyer" on public.orders for insert to authenticated with check(buyer_id=auth.uid() and buyer_id<>seller_id and exists(select 1 from public.listings l where l.id=listing_id and l.seller_id=seller_id and l.status='active' and l.quantity>=quantity));
drop policy if exists "order update seller admin" on public.orders;
create policy "order update seller admin" on public.orders for update to authenticated using(seller_id=auth.uid() or public.is_admin()) with check(seller_id=auth.uid() or public.is_admin());

drop policy if exists "support insert" on public.support_messages;
create policy "support insert" on public.support_messages for insert to anon,authenticated with check(user_id is null or user_id=auth.uid());
drop policy if exists "support read own admin" on public.support_messages;
create policy "support read own admin" on public.support_messages for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "support update admin" on public.support_messages;
create policy "support update admin" on public.support_messages for update to authenticated using(public.is_admin()) with check(public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-images','listing-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "public listing image read" on storage.objects;
create policy "public listing image read" on storage.objects for select to anon,authenticated using(bucket_id='listing-images');
drop policy if exists "upload own folder images" on storage.objects;
create policy "upload own folder images" on storage.objects for insert to authenticated with check(bucket_id='listing-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "update own folder images" on storage.objects;
create policy "update own folder images" on storage.objects for update to authenticated using(bucket_id='listing-images' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='listing-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "delete own folder images" on storage.objects;
create policy "delete own folder images" on storage.objects for delete to authenticated using(bucket_id='listing-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
