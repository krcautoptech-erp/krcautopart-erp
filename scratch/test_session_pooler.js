const { Client } = require("pg");

const connStr = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function testSessionPooler() {
  const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 5000 });
  try {
    console.log("Connecting to session pooler on port 5432...");
    await client.connect();
    console.log("Connected successfully!");
    const res = await client.query("SELECT version();");
    console.log(res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("Connection failed:", err.message);
  }
}

testSessionPooler();
