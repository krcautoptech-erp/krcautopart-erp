const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

const sql = `
create or replace function public.test_ordinality_fn(p_items jsonb)
returns table (raw_material_id bigint, quantity numeric, remarks text, needed_by_date date, ordinality bigint)
language plpgsql
as $$
begin
  return query
  select *
  from rows from(
    jsonb_to_recordset(p_items) as (
      raw_material_id bigint,
      quantity numeric,
      remarks text,
      needed_by_date date
    )
  ) with ordinality;
end;
$$;
`;

async function run() {
  try {
    await client.connect();
    console.log("Connected.");
    await client.query(sql);
    console.log("Function created.");
    const res = await client.query("select * from public.test_ordinality_fn('[{\"raw_material_id\": 1, \"quantity\": 10, \"remarks\": \"test\", \"needed_by_date\": \"2026-07-24\"}]'::jsonb)");
    console.log("Result:", res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
