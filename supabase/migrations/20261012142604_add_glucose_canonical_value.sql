-- Preserve an auditable canonical value for comparisons and reporting while
-- remaining compatible with older clients that only send the original value.
create or replace function private.normalize_glucose_canonical_value()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.value_mg_dl := case
    when new.unit_original = 'mmol_l' then round(new.value_original * 18.0182, 2)
    else new.value_original
  end;
  new.conversion_version := case
    when new.unit_original = 'mmol_l' then 'fixed-18.0182-v1'
    else 'identity-mgdl-v1'
  end;
  return new;
end;
$$;

drop trigger if exists normalize_glucose_canonical_value on public.glucose_readings;
create trigger normalize_glucose_canonical_value
before insert or update on public.glucose_readings
for each row execute function private.normalize_glucose_canonical_value();

update public.glucose_readings
set value_mg_dl = case
      when unit_original = 'mmol_l' then round(value_original * 18.0182, 2)
      else value_original
    end,
    conversion_version = case
      when unit_original = 'mmol_l' then 'fixed-18.0182-v1'
      else 'identity-mgdl-v1'
    end
where value_mg_dl is null or conversion_version is null;

alter table public.glucose_readings
  add constraint glucose_readings_canonical_positive_check
  check (value_mg_dl is null or value_mg_dl > 0);
