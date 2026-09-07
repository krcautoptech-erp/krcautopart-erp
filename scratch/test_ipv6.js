const { Client } = require("pg");

const connStr = "postgresql://postgres:krcautop_97@[2406:da18:167b:f900:e0dc:56d9:43f9:31b6]:5432/postgres";

async function testIpv6() {
  const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 5000 });
  try {
    console.log("Connecting using direct IPv6 address...");
    await client.connect();
    console.log("Connected successfully!");
    const res = await client.query("SELECT version();");
    console.log(res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("Connection failed:", err.message);
  }
}

testIpv6();
