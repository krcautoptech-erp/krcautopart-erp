const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    console.log("Connecting to Supabase PostgreSQL database...");
    await client.connect();
    console.log("Connected successfully.");

    const sql = `
      insert into erp_private.number_series (series_key, prefix, padding, reset_policy)
      values ('GR', 'GR', 4, 'monthly')
      on conflict (series_key) do update
      set 
        prefix = excluded.prefix, 
        padding = excluded.padding, 
        reset_policy = excluded.reset_policy, 
        is_active = true, 
        updated_at = now();
    `;

    console.log("Registering 'GR' number series...");
    const result = await client.query(sql);
    console.log("Success! Registered GR number series. Rows updated:", result.rowCount);

  } catch (err) {
    console.error("Execution failed:", err);
  } finally {
    await client.end();
    console.log("Database connection closed.");
  }
}

run();
