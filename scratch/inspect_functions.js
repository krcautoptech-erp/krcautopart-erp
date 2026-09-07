const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully.");

    // Check sequence
    const seq = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = 'public' AND sequence_name = 'raw_material_code_seq';
    `);
    console.log("Sequence raw_material_code_seq exists:", seq.rows.length > 0);

    // Check function
    const func = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'reserve_raw_material_code';
    `);
    console.log("Function reserve_raw_material_code exists:", func.rows.length > 0);

    // Check trigger
    const trig = await client.query(`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public' AND event_object_table = 'raw_materials' AND trigger_name = 'assign_raw_material_code_before_insert';
    `);
    console.log("Trigger assign_raw_material_code_before_insert exists:", trig.rows.length > 0);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
