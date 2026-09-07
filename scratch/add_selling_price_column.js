const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    console.log("Connecting to Supabase database...");
    await client.connect();
    console.log("Connected successfully.");

    console.log("Adding selling_price column to products table...");
    await client.query(`
      ALTER TABLE public.products 
      ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0;
    `);
    console.log("Column selling_price added successfully.");

  } catch (err) {
    console.error("Database modification failed:", err);
  } finally {
    await client.end();
    console.log("Database connection closed.");
  }
}

run();
