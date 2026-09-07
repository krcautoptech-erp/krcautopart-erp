const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const parts = trimmed.split("=");
      const key = parts[0]?.trim();
      const val = parts.slice(1).join("=").trim();
      if (key && val) {
        process.env[key] = val;
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const tablesToCheck = [
  { name: "vendors", migration: "202606160001_create_vendors.sql" },
  { name: "partner_customer_types", migration: "202606200001_create_partner_customer_types.sql" },
  { name: "customers", migration: "202606200002_create_customers.sql" },
  { name: "purchase_requisitions", migration: "202607010001_create_purchase_requisitions.sql" },
  { name: "raw_material_groups", migration: "202607130001_create_raw_material_master.sql" },
  { name: "raw_material_grades", migration: "202607130001_create_raw_material_master.sql" },
  { name: "raw_material_warehouses", migration: "202607130001_create_raw_material_master.sql" },
  { name: "raw_materials", migration: "202607130001_create_raw_material_master.sql" },
];

async function checkTables() {
  console.log("Checking Supabase tables status...\n");
  
  for (const table of tablesToCheck) {
    const { error } = await supabase.from(table.name).select("*").limit(1);
    if (error) {
      if (error.code === "PGRST116" || error.message.includes("does not exist") || error.code === "42P01") {
        console.log(`❌ Table "${table.name}" DOES NOT exist. (Required Migration: ${table.migration})`);
      } else {
        console.log(`✅ Table "${table.name}" exists (Received code: ${error.code})`);
      }
    } else {
      console.log(`✅ Table "${table.name}" exists and is accessible.`);
    }
  }

  console.log("\nChecking specific PR column modifications...");
  const { error: prColError } = await supabase.from("purchase_requisition_items").select("raw_material_id").limit(1);
  if (prColError && (prColError.message.includes("column") || prColError.message.includes("does not exist"))) {
    console.log(`❌ Column "raw_material_id" in purchase_requisition_items DOES NOT exist. (Required Migration: 20260719174651_link_purchase_requisitions_to_raw_materials.sql)`);
  } else if (prColError) {
    console.log(`✅ Column "raw_material_id" exists (Received code: ${prColError.code})`);
  } else {
    console.log(`✅ Column "raw_material_id" exists and is accessible.`);
  }
}

checkTables().catch(console.error);
