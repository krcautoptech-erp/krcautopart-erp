const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT 
        format('PR%s%04s', '2607', 3) as original_format,
        format('PR%s%s', '2607', lpad(3::text, 4, '0')) as fixed_lpad,
        format('PR%s%s', '2607', to_char(3, 'FM0000')) as fixed_to_char;
    `);
    console.log("Results:", res.rows[0]);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
