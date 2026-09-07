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

    console.log("Recreating materials table without material_code...");
    await client.query(`
      DROP TABLE IF EXISTS public.materials CASCADE;

      CREATE TABLE public.materials (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        material_name text NOT NULL UNIQUE,
        description text,
        status text NOT NULL DEFAULT 'ใช้งาน',
        created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `);
    console.log("Table public.materials recreated.");

    console.log("Enabling RLS policies...");
    await client.query(`
      ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "Enable select for authenticated users" ON public.materials
        FOR SELECT TO authenticated USING (true);

      CREATE POLICY "Enable insert for authenticated users" ON public.materials
        FOR INSERT TO authenticated WITH CHECK (true);

      CREATE POLICY "Enable update for authenticated users" ON public.materials
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

      CREATE POLICY "Enable delete for authenticated users" ON public.materials
        FOR DELETE TO authenticated USING (true);
    `);
    console.log("RLS policies configured.");

    console.log("Creating database indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_name ON public.materials (material_name);
    `);
    console.log("Index created.");

    console.log("Seeding default materials...");
    const defaultMaterials = [
      { name: "SPCC", desc: "Steel Plate Cold Rolled Commercial - เหล็กแผ่นรีดเย็นสำหรับงานทั่วไป" },
      { name: "SPHC", desc: "Steel Plate Hot Rolled Commercial - เหล็กแผ่นรีดร้อนสำหรับงานทั่วไป" },
      { name: "SPHC-P/O", desc: "Steel Plate Hot Rolled Pickled and Oiled - เหล็กแผ่นรีดร้อนผ่านกรดเคลือบน้ำมัน" },
      { name: "SS400", desc: "Structural Steel 400 - เหล็กโครงสร้างทั่วไป รับแรงดึงสูงสุด 400 MPa" },
      { name: "ALUMINUM", desc: "Aluminum Plate - แผ่นอลูมิเนียม น้ำหนักเบา ไม่เป็นสนิม" },
      { name: "GALVANIZED", desc: "Galvanized Steel - เหล็กแผ่นเคลือบสังกะสี กันสนิมได้ดี" },
      { name: "SUS304", desc: "Stainless Steel 304 - สแตนเลสเกรด 304 ทนสารเคมีและการกัดกร่อนสูง" },
    ];

    for (const mat of defaultMaterials) {
      await client.query(`
        INSERT INTO public.materials (material_name, description, status)
        VALUES ($1, $2, 'ใช้งาน')
        ON CONFLICT (material_name) DO NOTHING;
      `, [mat.name, mat.desc]);
    }
    console.log("Seeding completed successfully.");

  } catch (err) {
    console.error("Database migration failed:", err);
  } finally {
    await client.end();
    console.log("Database connection closed.");
  }
}

run();
