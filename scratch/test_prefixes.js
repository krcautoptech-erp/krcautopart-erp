const { Client } = require("pg");

const prefixes = ["aws-0", "aws-1", "aws-2", "aws-3", "aws-4"];
const region = "ap-southeast-1";

async function testPrefixes() {
  for (const prefix of prefixes) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const connStr = `postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@${host}:6543/postgres`;
    const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 3000 });
    
    try {
      console.log(`Testing host: ${host}...`);
      await client.connect();
      console.log(`>>> SUCCESS with host: ${host}! <<<`);
      await client.end();
      return;
    } catch (err) {
      console.log(`Failed for ${host}: ${err.message}`);
    }
  }
}

testPrefixes();
