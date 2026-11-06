import { pool } from '../packages/scraper/src/database/connection.js';

async function main() {
  console.log("=== CHECKING POSTGRESQL CONSTRAINTS ON 'prices' ===");
  try {
    const res = await pool.query(`
      SELECT 
        conname as constraint_name,
        contype as constraint_type,
        pg_get_constraintdef(c.oid) as constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE cl.relname = 'prices'
      ORDER BY conname;
    `);
    console.table(res.rows);

    const idxRes = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'prices'
      ORDER BY indexname;
    `);
    console.log("\nIndexes on 'prices':");
    console.table(idxRes.rows);
  } catch (err: any) {
    console.error("Pool query failed:", err.message);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
