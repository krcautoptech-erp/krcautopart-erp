const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

const migrationPath = path.join(__dirname, "../supabase/migrations/20260818204500_simplify_goods_receipt_lots.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB successfully.");
    await client.query(sql);
    console.log("Migration executed successfully!");
  } catch (err) {
    console.error("Error executing SQL migration:", err);
  } finally {
    await client.end();
  }
}

run();
