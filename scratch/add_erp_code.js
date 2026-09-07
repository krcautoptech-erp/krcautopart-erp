const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";
const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");

    // 1. Add erp_code column
    console.log("Adding column 'erp_code' to public.products table...");
    await client.query(`
      ALTER TABLE public.products ADD COLUMN IF NOT EXISTS erp_code text;
    `);
    console.log("Column 'erp_code' added successfully.");

    // 2. Add index for erp_code
    console.log("Creating index on erp_code...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_erp_code ON public.products (erp_code);
    `);
    console.log("Index created.");

    // 3. Read JSON data
    const jsonPath = path.join(__dirname, "../src/data/asico-products.json");
    if (!fs.existsSync(jsonPath)) {
      console.error(`JSON file not found at ${jsonPath}`);
      return;
    }

    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const products = JSON.parse(rawData);
    console.log(`Loaded ${products.length} products from JSON.`);

    // 4. Update existing records in the database with their erpCode
    let updatedCount = 0;
    for (const prod of products) {
      const part_number = prod.partNumber || "";
      const erp_code = prod.erpCode || "";

      if (part_number && erp_code) {
        const res = await client.query(
          "UPDATE public.products SET erp_code = $1 WHERE part_number = $2",
          [erp_code, part_number]
        );
        if (res.rowCount > 0) {
          updatedCount++;
        }
      }
    }
    console.log(`Updated erp_code for ${updatedCount} products in the database.`);

    // 5. Verify columns
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products'
      ORDER BY ordinal_position;
    `);
    console.log("Updated columns in 'products' table:");
    res.rows.forEach(row => {
      console.log(` - ${row.column_name}: ${row.data_type}`);
    });

  } catch (err) {
    console.error("Migration failed with error:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
