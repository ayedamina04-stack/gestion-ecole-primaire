import pg from 'pg';
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
export async function audit(uid, action, entite, id, avant, apres) {
  await pool.query(
    'INSERT INTO journal_audit(utilisateur_id,action,entite,entite_id,ancienne_valeur,nouvelle_valeur) VALUES($1,$2,$3,$4,$5,$6)',
    [uid, action, entite, String(id ?? ''), avant ?? null, apres ?? null]);
}
