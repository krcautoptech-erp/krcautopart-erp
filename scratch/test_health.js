const url = "https://whkocywbsoiqfqpeppgq.supabase.co/auth/v1/health";

async function testHealth() {
  try {
    const res = await fetch(url);
    console.log("Health Status:", res.status);
    const data = await res.json();
    console.log("Response:", data);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testHealth();
