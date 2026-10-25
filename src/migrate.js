import 'dotenv/config';
import fs from 'fs';
import { pool } from './db.js';
const { rows } = await pool.query("SELECT to_regclass('public.utilisateurs') AS t");
if (rows[0].t) console.log('Schéma déjà présent : rien à faire.');
else { await pool.query(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')); console.log('Schéma créé.'); }
await pool.end();
