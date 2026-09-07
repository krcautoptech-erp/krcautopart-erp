const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";
const client = new Client({ connectionString });

async function enrich() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");

    // 0. Ensure 'model' column exists in database
    console.log("Ensuring 'model' column exists in public.products table...");
    await client.query(`
      ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model text;
    `);
    console.log("Column 'model' checked/added.");

    // 1. Read JSON file containing original products
    const jsonPath = path.join(__dirname, "../src/data/asico-products.json");
    if (!fs.existsSync(jsonPath)) {
      console.error(`JSON file not found at ${jsonPath}`);
      return;
    }
    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const jsonProducts = JSON.parse(rawData);
    console.log(`Loaded ${jsonProducts.length} original products from JSON.`);

    // 2. Build mapping dictionaries from JSON (exact and normalized keys)
    const exactMap = new Map();
    const normMap = new Map();

    function normalizePart(partNo) {
      if (!partNo) return "";
      return partNo.replace(/[-\s]/g, "").toUpperCase();
    }

    jsonProducts.forEach(prod => {
      const partNo = prod.partNumber;
      if (!partNo) return;

      const info = {
        std_no: prod.stdNo || null,
        material: prod.material || null,
        model: prod.model || null,
        primary_image: prod.primaryImage || (prod.imagePaths && prod.imagePaths[0]) || null
      };

      // Exact match map
      if (!exactMap.has(partNo.trim())) {
        exactMap.set(partNo.trim(), info);
      }

      // Normalized match map
      const norm = normalizePart(partNo);
      if (!normMap.has(norm)) {
        normMap.set(norm, info);
      }
    });

    // 3. Fetch newly seeded products from database
    const dbRes = await client.query("SELECT id, part_number FROM public.products");
    const dbProducts = dbRes.rows;
    console.log(`Found ${dbProducts.length} products in the database to enrich.`);

    let enrichedCount = 0;
    let notFoundCount = 0;

    // 4. Perform updates
    for (const dbProd of dbProducts) {
      const partNumber = dbProd.part_number ? dbProd.part_number.trim() : "";
      if (!partNumber) continue;

      // Try exact match first, then normalized match
      let info = exactMap.get(partNumber);
      if (!info) {
        const norm = normalizePart(partNumber);
        info = normMap.get(norm);
      }

      if (info) {
        await client.query(
          `UPDATE public.products 
           SET std_no = $1, material = $2, model = $3, primary_image = $4
           WHERE id = $5`,
          [info.std_no, info.material, info.model, info.primary_image, dbProd.id]
        );
        enrichedCount++;
      } else {
        notFoundCount++;
      }
    }

    console.log(`Enrichment complete.`);
    console.log(` - Successfully enriched: ${enrichedCount} products`);
    console.log(` - Original data not found for: ${notFoundCount} products`);

  } catch (err) {
    console.error("Enrichment failed with error:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

enrich();
