const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

const sql = `
create or replace function public.set_purchase_requisition_number()
returns trigger
language plpgsql
as $$
begin
  if new.pr_number is null or btrim(new.pr_number) = '' then
    new.pr_number := format(
      'PR%s%s',
      to_char(coalesce(new.document_date, current_date), 'YYMM'),
      lpad(nextval('public.purchase_requisition_number_seq')::text, 4, '0')
    );
  end if;

  return new;
end;
$$;
`;

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB.");
    await client.query(sql);
    console.log("Updated function set_purchase_requisition_number.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
