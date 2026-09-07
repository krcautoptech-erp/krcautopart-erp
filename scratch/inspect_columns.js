const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully.");

    const tables = ['raw_materials', 'purchase_requisitions', 'purchase_requisition_items', 'purchase_requisition_approval_logs'];
    
    for (const table of tables) {
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      console.log(`\nColumns of ${table}:`);
      console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`));
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
