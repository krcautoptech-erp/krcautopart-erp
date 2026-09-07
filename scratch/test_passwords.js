const { Client } = require("pg");

const host = "aws-0-ap-southeast-1.pooler.supabase.com";
const passwords = ["krcautop_97", "krcautop97"];

async function testPasswords() {
  for (const pw of passwords) {
    const connStr = `postgresql://postgres.whkocywbsoiqfqpeppgq:${pw}@${host}:6543/postgres`;
    const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 3000 });
    
    try {
      console.log(`Testing password: ${pw}...`);
      await client.connect();
      console.log(`>>> SUCCESS with password: ${pw}! <<<`);
      const res = await client.query("SELECT version();");
      console.log(res.rows[0]);
      await client.end();
      return;
    } catch (err) {
      console.log(`Failed for ${pw}: ${err.message}`);
    }
  }
}

testPasswords();
