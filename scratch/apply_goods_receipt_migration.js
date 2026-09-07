const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function applyMigrations() {
  try {
    console.log("Connecting to Supabase PostgreSQL database...");
    await client.connect();
    console.log("Connected successfully.");

    const migrationFiles = [
      "20260731135835_create_goods_receipt_and_stock_management.sql",
      "20260731140024_add_gr_number_trigger.sql",
      "20260731140115_add_post_goods_receipt_rpc.sql",
      "20260731140300_seed_gr_number_series.sql"
    ];

    for (const filename of migrationFiles) {
      const migrationPath = path.join(__dirname, `../supabase/migrations/${filename}`);
      console.log(`Reading migration SQL file from: ${migrationPath}`);
      const sql = fs.readFileSync(migrationPath, "utf-8");

      console.log(`Executing SQL migration ${filename} on database...`);
      await client.query(sql);
      console.log(`Migration ${filename} executed successfully!`);
    }

  } catch (err) {
    console.error("Migration execution failed:", err);
  } finally {
    await client.end();
    console.log("Database connection closed.");
  }
}

applyMigrations();
