const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

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

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const requisitionResult = await supabase
    .from("purchase_requisitions")
    .select(
      "id, pr_number, document_date, requester_name, department_name, needed_by_date, status, requested_item_count, requested_total_qty, remarks",
    )
    .order("document_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(180);

  console.log("Requisition Result error:", JSON.stringify(requisitionResult.error, null, 2));
  console.log("Requisition Result data length:", requisitionResult.data ? requisitionResult.data.length : null);
}

run();
