import psycopg2

conn_str = "postgresql://postgres:krcautop_97@db.whkocywbsoiqfqpeppgq.supabase.co:5432/postgres"

try:
    print("Connecting to Supabase PostgreSQL...")
    conn = psycopg2.connect(conn_str)
    cur = conn.cursor()
    cur.execute("SELECT version();")
    db_version = cur.fetchone()
    print("Connection successful! Postgres version:", db_version)
    cur.close()
    conn.close()
except Exception as e:
    print("Error connecting:", e)
