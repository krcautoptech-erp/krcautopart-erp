const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    const { rows } = await client.query("SELECT * FROM public.materials WHERE id = $1", ["7c1a2227-80d9-4322-9f68-9e7426db3a15"]);
    console.log("Matching rows:", rows);

    const { rows: allRows } = await client.query("SELECT id, material_name, status FROM public.materials");
    console.log("All rows in materials table:", allRows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
