const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = new Client({
  connectionString: connectionString,
});

async function migrate() {
  try {
    console.log("Connecting to Supabase PostgreSQL database...");
    await client.connect();
    console.log("Connected successfully.");

    // 1. Drop existing table if we want a fresh start, or keep it. Let's recreate it clean.
    console.log("Creating public.products table...");
    await client.query(`
      DROP TABLE IF EXISTS public.products CASCADE;
      
      CREATE TABLE public.products (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        part_number text NOT NULL UNIQUE,
        part_name text NOT NULL,
        material text,
        plating text,
        std_no text,
        sheet_count numeric,
        parts_per_sheet integer,
        primary_image text,
        cost_price numeric DEFAULT 0,
        unit text NOT NULL DEFAULT 'ชิ้น',
        status text NOT NULL DEFAULT 'ใช้งาน',
        created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `);
    console.log("Table public.products created successfully.");

    // 2. Enable RLS and add policies
    console.log("Enabling Row Level Security (RLS) and policies...");
    await client.query(`
      ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "Enable select for authenticated users" ON public.products
        FOR SELECT TO authenticated USING (true);

      CREATE POLICY "Enable insert for authenticated users" ON public.products
        FOR INSERT TO authenticated WITH CHECK (true);

      CREATE POLICY "Enable update for authenticated users" ON public.products
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

      CREATE POLICY "Enable delete for authenticated users" ON public.products
        FOR DELETE TO authenticated USING (true);
    `);
    console.log("RLS policies applied.");

    // 3. Create Index on search fields (Performance Best Practice from pg skill)
    console.log("Creating database indexes for query optimization...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_part_name ON public.products (part_name);
      CREATE INDEX IF NOT EXISTS idx_products_status ON public.products (status);
    `);
    console.log("Indexes created.");

    // 4. Migrate products data from JSON
    const jsonPath = path.join(__dirname, "../src/data/asico-products.json");
    if (!fs.existsSync(jsonPath)) {
      console.log(`JSON file not found at ${jsonPath}. Skipping seed data.`);
      return;
    }

    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const products = JSON.parse(rawData);
    console.log(`Loaded ${products.length} products from JSON file. Inserting into Supabase...`);

    let insertedCount = 0;
    for (const prod of products) {
      const part_number = prod.partNumber || "";
      const part_name = prod.partName || "";
      const material = prod.material || null;
      const plating = prod.plating || null;
      const std_no = prod.stdNo || null;
      
      let sheet_count = prod.sheetCount && String(prod.sheetCount).trim() !== "" 
        ? parseFloat(prod.sheetCount) 
        : null;
      if (sheet_count !== null && isNaN(sheet_count)) {
        sheet_count = null;
      }
        
      let parts_per_sheet = prod.partsPerSheet && String(prod.partsPerSheet).trim() !== "" 
        ? parseInt(prod.partsPerSheet, 10) 
        : null;
      if (parts_per_sheet !== null && isNaN(parts_per_sheet)) {
        parts_per_sheet = null;
      }
        
      const primary_image = prod.primaryImage || (prod.imagePaths && prod.imagePaths[0]) || null;
      
      let cost_price = prod.cost_price !== undefined && prod.cost_price !== null
        ? parseFloat(prod.cost_price)
        : 0;
      if (isNaN(cost_price)) {
        cost_price = 0;
      }

      const unit = "ชิ้น"; // Default unit requested by user
      const status = prod.status || "ใช้งาน";

      await client.query(`
        INSERT INTO public.products (
          part_number, part_name, material, plating, std_no, 
          sheet_count, parts_per_sheet, primary_image, cost_price, unit, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (part_number) DO UPDATE SET
          part_name = EXCLUDED.part_name,
          material = EXCLUDED.material,
          plating = EXCLUDED.plating,
          std_no = EXCLUDED.std_no,
          sheet_count = EXCLUDED.sheet_count,
          parts_per_sheet = EXCLUDED.parts_per_sheet,
          primary_image = EXCLUDED.primary_image,
          cost_price = EXCLUDED.cost_price,
          unit = EXCLUDED.unit,
          status = EXCLUDED.status;
      `, [
        part_number, part_name, material, plating, std_no,
        sheet_count, parts_per_sheet, primary_image, cost_price, unit, status
      ]);

      insertedCount++;
    }

    console.log(`Successfully migrated ${insertedCount} products to Supabase.`);

  } catch (err) {
    console.error("Migration failed with error:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

migrate();
