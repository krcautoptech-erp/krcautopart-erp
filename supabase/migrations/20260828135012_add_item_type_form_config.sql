alter table public.item_types
  add column if not exists form_field_config jsonb not null default jsonb_build_object(
    'brand', 'optional',
    'model', 'optional',
    'partNumber', 'optional',
    'dimensions', 'hidden',
    'image', 'optional',
    'attachments', 'optional',
    'description', 'optional',
    'leadTime', 'optional',
    'vendors', 'optional'
  );

alter table public.item_types
  drop constraint if exists item_types_form_field_config_check;

alter table public.item_types
  add constraint item_types_form_field_config_check check (
    jsonb_typeof(form_field_config) = 'object'
    and not jsonb_path_exists(
      form_field_config,
      '$.* ? (@ != "hidden" && @ != "optional" && @ != "required")'
    )
  );
