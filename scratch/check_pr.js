const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();
    console.log("Connected successfully.");

    // Query all tables in public schema
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log("Tables in public schema:");
    console.log(tablesResult.rows.map(r => r.table_name));

  } catch (err) {
    console.error("Failed to list tables:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
