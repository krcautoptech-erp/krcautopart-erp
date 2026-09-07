const { Client } = require("pg");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    console.log("Connecting to Supabase PostgreSQL database...");
    await client.connect();
    console.log("Connected successfully.");

    console.log("Creating public.materials table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.materials (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        material_code text NOT NULL UNIQUE,
        material_name text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'ใช้งาน',
        created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `);
    console.log("Table public.materials created or already exists.");

    console.log("Enabling Row Level Security (RLS) and policies on materials table...");
    await client.query(`
      ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

      -- Drop existing policies if any to avoid duplicates
      DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.materials;
      DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.materials;
      DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.materials;
      DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.materials;

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

    console.log("Creating indexes for query optimization...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_materials_code ON public.materials (material_code);
      CREATE INDEX IF NOT EXISTS idx_materials_name ON public.materials (material_name);
    `);
    console.log("Indexes created.");

    // Seed some initial materials if the table is empty
    const { rows } = await client.query("SELECT COUNT(*) FROM public.materials");
    const count = parseInt(rows[0].count, 10);
    if (count === 0) {
      console.log("Seeding default materials...");
      const defaultMaterials = [
        { code: "MAT-SPCC", name: "SPCC", desc: "Steel Plate Cold Rolled Commercial - เหล็กแผ่นรีดเย็นสำหรับงานทั่วไป" },
        { code: "MAT-SPHC", name: "SPHC", desc: "Steel Plate Hot Rolled Commercial - เหล็กแผ่นรีดร้อนสำหรับงานทั่วไป" },
        { code: "MAT-SPHC-PO", name: "SPHC-P/O", desc: "Steel Plate Hot Rolled Pickled and Oiled - เหล็กแผ่นรีดร้อนผ่านกระบวนการล้างกรดและเคลือบน้ำมัน" },
        { code: "MAT-SS400", name: "SS400", desc: "Structural Steel 400 - เหล็กโครงสร้างทั่วไป รับแรงดึงสูงสุด 400 MPa" },
        { code: "MAT-AL", name: "ALUMINUM", desc: "Aluminum Plate - แผ่นอลูมิเนียม น้ำหนักเบา ไม่เป็นสนิม" },
        { code: "MAT-GI", name: "GALVANIZED", desc: "Galvanized Steel - เหล็กแผ่นเคลือบสังกะสี กันสนิมได้ดี" },
        { code: "MAT-SUS304", name: "SUS304", desc: "Stainless Steel 304 - สแตนเลสเกรด 304 ทนสารเคมีและการกัดกร่อนสูง" },
      ];

      for (const mat of defaultMaterials) {
        await client.query(`
          INSERT INTO public.materials (material_code, material_name, description, status)
          VALUES ($1, $2, $3, 'ใช้งาน')
          ON CONFLICT (material_code) DO NOTHING;
        `, [mat.code, mat.name, mat.desc]);
      }
      console.log("Default materials seeded successfully.");
    } else {
      console.log(`Table already has ${count} records. Seeding skipped.`);
    }

  } catch (err) {
    console.error("Database script failed:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
