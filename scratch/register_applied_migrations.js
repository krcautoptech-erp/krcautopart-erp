const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

const versionsToRegister = [
  '202607130001',
  '20260719132550',
  '20260719141804',
  '20260719153631',
  '20260719163754',
  '20260719170959'
];

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully.");

    for (const version of versionsToRegister) {
      // Check if already registered
      const checkRes = await client.query(
        "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1",
        [version]
      );

      if (checkRes.rows.length === 0) {
        await client.query(
          "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1)",
          [version]
        );
        console.log(`Registered migration: ${version}`);
      } else {
        console.log(`Migration ${version} already registered.`);
      }
    }

    console.log("Finished registering migrations.");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
