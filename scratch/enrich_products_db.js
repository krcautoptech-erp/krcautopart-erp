const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres.whkocywbsoiqfqpeppgq:krcautop_97@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";
const client = new Client({ connectionString });

// We will load the Excel data by generating a temporary JSON file via python (which handles xlsx reading with openpyxl)
// then reading that JSON file in Node.js to update the database via pg client.
async function enrich() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");

    const excelJsonPath = path.join(__dirname, "temp_excel_data.json");
    if (!fs.existsSync(excelJsonPath)) {
      console.error(`Temporary Excel JSON data not found at ${excelJsonPath}`);
      return;
    }

    const rawData = fs.readFileSync(excelJsonPath, "utf-8");
    const excelRecords = JSON.parse(rawData);
    console.log(`Loaded ${Object.keys(excelRecords).length} unique part number mappings from temp JSON.`);

    // 1. Build image mapping
    console.log("Mapping drawings/images from public folder...");
    const drawingsDir = path.join(__dirname, "../public/products/asico");
    const imageMap = {};
    if (fs.existsSync(drawingsDir)) {
      const files = fs.readdirSync(drawingsDir);
      files.forEach(fname => {
        const normalize = (p) => p.replace(/[^A-Z0-9]/gi, "").toUpperCase();
        
        const match = fname.match(/part-(.*?)-\d+_transparent\.png/);
        if (match) {
          imageMap[normalize(match[1])] = `/products/asico/${fname}`;
        } else {
          const base = fname.replace("_transparent.png", "");
          const parts = base.split("-");
          if (parts.length >= 4) {
            imageMap[normalize(parts[3])] = `/products/asico/${fname}`;
          }
        }
      });
    }
    console.log(`Mapped ${Object.keys(imageMap).length} images.`);

    // 2. Fetch all products from DB
    const res = await client.query("SELECT id, part_number FROM public.products");
    const dbProducts = res.rows;
    console.log(`Found ${dbProducts.length} products in the database to update.`);

    let enrichedCount = 0;
    let stdCount = 0;
    let matCount = 0;
    let modCount = 0;
    let imgCount = 0;

    const normalize = (p) => p.replace(/[^A-Z0-9]/gi, "").toUpperCase();

    // 3. Update records
    for (const prod of dbProducts) {
      const partNo = prod.part_number ? prod.part_number.trim() : "";
      if (!partNo) continue;

      const normKey = normalize(partNo);
      const rec = excelRecords[normKey];
      let imgPath = imageMap[normKey];

      // Fallback prefix image matching
      if (!imgPath) {
        for (const imgKey in imageMap) {
          if (normKey.startsWith(imgKey) || imgKey.startsWith(normKey)) {
            imgPath = imageMap[imgKey];
            break;
          }
        }
      }

      if (rec || imgPath) {
        const std_no = rec && rec.std_no ? rec.std_no : null;
        const material = rec && rec.material ? rec.material : null;
        const model = rec && rec.model ? rec.model : null;

        await client.query(
          `UPDATE public.products 
           SET std_no = COALESCE($1, std_no),
               material = COALESCE($2, material),
               model = COALESCE($3, model),
               primary_image = COALESCE($4, primary_image)
           WHERE id = $5`,
          [std_no, material, model, imgPath, prod.id]
        );

        enrichedCount++;
        if (std_no) stdCount++;
        if (material) matCount++;
        if (model) modCount++;
        if (imgPath) imgCount++;
      }
    }

    console.log(`Data enrichment completed successfully.`);
    console.log(`Total products updated: ${enrichedCount}`);
    console.log(`  - Standards mapped: ${stdCount}`);
    console.log(`  - Materials mapped: ${matCount}`);
    console.log(`  - Models mapped: ${modCount}`);
    console.log(`  - Images mapped: ${imgCount}`);

    // Clean up temporary file
    try {
      fs.unlinkSync(excelJsonPath);
      console.log("Cleaned up temporary Excel JSON file.");
    } catch (e) {
      // ignore
    }

  } catch (err) {
    console.error("Enrichment failed:", err);
  } finally {
    await client.end();
  }
}

enrich();
