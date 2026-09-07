const url = "https://whkocywbsoiqfqpeppgq.supabase.co/rest/v1/";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoa29jeXdic29pcWZxcGVwcGdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjgwMDEsImV4cCI6MjA5NzAwNDAwMX0.rSIrzErGtQdhxllvcMsmXbHBbdXathxCEfJRvrd0j8E";

async function testApi() {
  try {
    const res = await fetch(url, {
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Tables found in schema:", Object.keys(data.paths || {}));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testApi();
