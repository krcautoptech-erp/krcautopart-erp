const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully.");

    // Check all schemas
    const schemas = await client.query(`
      SELECT schema_name FROM information_schema.schemata;
    `);
    console.log("Schemas:", schemas.rows.map(r => r.schema_name));

    // Check if supabase_migrations exists and its tables
    const tables = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%migration%';
    `);
    console.log("Migration tables found:", tables.rows);

    // If supabase_migrations.schema_migrations exists, query it
    try {
      const migs = await client.query(`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`);
      console.log("Applied migrations in supabase_migrations.schema_migrations:");
      console.log(migs.rows.map(r => r.version));
    } catch (e) {
      console.log("Could not query supabase_migrations.schema_migrations:", e.message);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
