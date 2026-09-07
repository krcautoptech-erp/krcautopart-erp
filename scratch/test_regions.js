const { Client } = require("pg");

const regions = [
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "ap-northeast-3", "ap-south-1", "ap-east-1", "us-east-1", "us-east-2",
  "us-west-1", "us-west-2", "ca-central-1", "eu-central-1", "eu-west-1",
  "eu-west-2", "eu-west-3", "eu-south-1", "eu-north-1", "me-south-1",
  "sa-east-1"
];

async function testRegions() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const connStr = `postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@${host}:6543/postgres`;
    const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 2000 });
    
    try {
      console.log(`Testing region: ${region}...`);
      await client.connect();
      console.log(`>>> SUCCESS! Connected to region: ${region} <<<`);
      await client.end();
      return;
    } catch (err) {
      if (err.message.includes("tenant/user postgres.whkocywbsoiqfqpeppgq not found")) {
        // This means host is reachable but project is not in this region
        continue;
      }
      console.log(`Failed for ${region}: ${err.message}`);
    }
  }
  console.log("All region tests completed.");
}

testRegions();
