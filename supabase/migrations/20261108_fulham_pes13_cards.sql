-- Fulham: tarjetas reales exportadas por el usuario desde el editor PES 2013.
-- CSV SHA-256: 8cbdf32fbfc572eecab9d707fe1cfe2dd4174b69c098fac1739463b4dbd3f55e
-- Crea el campo si falta. Ejecutar completo en una consulta nueva de SQL Editor.
-- Solo carga players.pes2013_cards; no modifica stats, media, valor ni otros campos.
begin;
alter table public.players add column if not exists pes2013_cards jsonb;
create or replace function public.valid_pes2013_cards(cards jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare item jsonb; category text; pattern text;
begin
  if cards is null then return true; end if;
  if jsonb_typeof(cards) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(cards)) <> 2 then return false; end if;
  foreach category in array array['playing_styles','special_skills'] loop
    if jsonb_typeof(cards->category) is distinct from 'array' then return false; end if;
    pattern := case category when 'playing_styles' then '^P(0[1-9]|1[0-8])$' else '^S(0[1-9]|1[0-9]|2[0-6])$' end;
    for item in select value from jsonb_array_elements(cards->category) loop
      if jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ pattern then return false; end if;
    end loop;
    if (select count(*) <> count(distinct value) from jsonb_array_elements(cards->category)) then return false; end if;
  end loop;
  return true;
end;
$$;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.players'::regclass and conname='players_pes2013_cards_valid') then
    alter table public.players add constraint players_pes2013_cards_valid check (public.valid_pes2013_cards(pes2013_cards));
  end if;
end;
$$;

do $import$
declare
 imported jsonb := $payload$[
  {
    "id": "adb8d19c-5091-443b-9622-af81ec416813",
    "name": "Alex Iwobi",
    "pes_id": 42575,
    "cards": {
      "playing_styles": [
        "P05",
        "P06"
      ],
      "special_skills": [
        "S07",
        "S08",
        "S09",
        "S10",
        "S12"
      ]
    }
  },
  {
    "id": "484d1f2a-773d-4955-9a6e-a3ef4462c1e3",
    "name": "Antonee Robinson",
    "pes_id": 53589,
    "cards": {
      "playing_styles": [],
      "special_skills": [
        "S21"
      ]
    }
  },
  {
    "id": "c8bf0914-e8ad-44f1-a63e-06149748a7ff",
    "name": "Benjamin Lecomte",
    "pes_id": 42821,
    "cards": {
      "playing_styles": [],
      "special_skills": [
        "S26"
      ]
    }
  },
  {
    "id": "51ac5ab7-c004-4420-a102-ccdc400c6fb9",
    "name": "Bernd Leno",
    "pes_id": 54360,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "bb50ed5d-d73a-4e93-ae49-0e7a8183fc5c",
    "name": "Calvin Bassey",
    "pes_id": 47329,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "d37d574a-b245-48f7-ad6b-2208632712ef",
    "name": "Chukwueze",
    "pes_id": 46828,
    "cards": {
      "playing_styles": [
        "P05"
      ],
      "special_skills": [
        "S07",
        "S08",
        "S09",
        "S10",
        "S12"
      ]
    }
  },
  {
    "id": "7d6f2826-4172-4d6e-9de5-fa0ab856185b",
    "name": "Gonzalo García",
    "pes_id": 55470,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "6cc55a95-d037-47f4-9de0-8c6e175ef3b9",
    "name": "Harrison Reed",
    "pes_id": 4252,
    "cards": {
      "playing_styles": [],
      "special_skills": [
        "S24"
      ]
    }
  },
  {
    "id": "41e9f012-ae21-4b26-af6d-9525d58a88ed",
    "name": "Harry Wilson",
    "pes_id": 118082,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "e280cb15-b913-4ad5-b7dc-9c1860ed47cc",
    "name": "Issa Diop",
    "pes_id": 1913,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "9f966c3a-a403-46fe-a303-424ee3c8cbad",
    "name": "Joachim Andersen",
    "pes_id": 53425,
    "cards": {
      "playing_styles": [
        "P06"
      ],
      "special_skills": []
    }
  },
  {
    "id": "f5cdf144-5359-428b-9a57-ec78feab6d17",
    "name": "Jonah Kusi-Asare",
    "pes_id": 55849,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "8c1081b9-42f0-4018-a865-70a338a85e00",
    "name": "Jorge Cuenca",
    "pes_id": 6259,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "6aa17263-d4de-4503-b2be-5fa2b0d0021d",
    "name": "Josh King",
    "pes_id": 117561,
    "cards": {
      "playing_styles": [
        "P02"
      ],
      "special_skills": []
    }
  },
  {
    "id": "0b43c437-9f39-4caa-8461-6c34c6b2a3b1",
    "name": "Kenny Tete",
    "pes_id": 37995,
    "cards": {
      "playing_styles": [],
      "special_skills": [
        "S03"
      ]
    }
  },
  {
    "id": "e06465e9-31e7-4939-b537-57b19cca3e69",
    "name": "Kevin",
    "pes_id": 46094,
    "cards": {
      "playing_styles": [
        "P07"
      ],
      "special_skills": []
    }
  },
  {
    "id": "28e74ecc-14ce-4364-8d8c-192abf6a7436",
    "name": "Oscar Bobb",
    "pes_id": 115937,
    "cards": {
      "playing_styles": [
        "P05"
      ],
      "special_skills": [
        "S07",
        "S08",
        "S09",
        "S10",
        "S12"
      ]
    }
  },
  {
    "id": "b80d1916-c384-4f62-b1ea-c1ae0e6d892b",
    "name": "Raul Jiménez",
    "pes_id": 46919,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "1e3387fd-c7ec-4609-8614-dc099ac7e8e3",
    "name": "Rodrigo Muniz",
    "pes_id": 8479,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "89270ece-40c4-4928-9cd0-5a0ce34cd382",
    "name": "Ryan Sessegnon",
    "pes_id": 35496,
    "cards": {
      "playing_styles": [
        "P05"
      ],
      "special_skills": [
        "S07",
        "S08",
        "S09",
        "S10",
        "S12",
        "S21"
      ]
    }
  },
  {
    "id": "7c066528-25fd-42c4-9f03-d29dcdd51640",
    "name": "Sander Berge",
    "pes_id": 6080,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "526d55ca-22eb-4051-87e0-c1fbc54ef557",
    "name": "Sasa Lukic",
    "pes_id": 103437,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  },
  {
    "id": "85dc2c9a-01e5-496e-a64e-9e6a2117d716",
    "name": "Smith Rowe",
    "pes_id": 38297,
    "cards": {
      "playing_styles": [
        "P05",
        "P17"
      ],
      "special_skills": [
        "S07",
        "S08",
        "S09",
        "S10",
        "S12"
      ]
    }
  },
  {
    "id": "968f9b69-8b27-4b78-9a8e-007ac237f902",
    "name": "Timothy Castagne",
    "pes_id": 118212,
    "cards": {
      "playing_styles": [
        "P01",
        "P15"
      ],
      "special_skills": []
    }
  },
  {
    "id": "5f92172b-98c8-4647-a6f4-4843e1258d57",
    "name": "Tom Cairney",
    "pes_id": 54296,
    "cards": {
      "playing_styles": [],
      "special_skills": []
    }
  }
]$payload$::jsonb;
 expected_club uuid := '1e653b01-52b5-44f6-be9d-5047e6d8af30';
 item jsonb; pl public.players%rowtype; n integer := 0;
begin
 perform 1 from public.players where id in (select (x->>'id')::uuid from jsonb_array_elements(imported) x) order by id for update;
 if not exists (select 1 from public.clubs where id=expected_club and name='Fulham' and not archived) then
  raise exception 'No se encontró el Fulham activo esperado. No se importó nada.';
 end if;
 for item in select value from jsonb_array_elements(imported) loop
  select * into pl from public.players where id=(item->>'id')::uuid;
  if not found then raise exception 'Falta el jugador %. No se importó nada.',item->>'name'; end if;
  if pl.club_id is distinct from expected_club or pl.name is distinct from item->>'name' or pl.archived or pl.retired then
   raise exception 'Cambió la identidad, equipo o estado de %. No se importó nada.',item->>'name';
  end if;
  if pl.pes2013_cards is not null and pl.pes2013_cards is distinct from item->'cards' then
   raise exception 'Ya existen tarjetas diferentes para %. No se importó nada; revisalas antes de continuar.',pl.name;
  end if;
  update public.players set pes2013_cards=item->'cards' where id=pl.id;
  n:=n+1;
 end loop;
 if n<>25 then raise exception 'Se esperaban 25 jugadores. No se importó nada.'; end if;
 raise notice 'Tarjetas PES 2013 del CSV cargadas para % jugadores del Fulham.',n;
end;
$import$;
commit;
