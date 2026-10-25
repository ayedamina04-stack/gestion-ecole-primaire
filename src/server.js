import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, audit } from './db.js';
import ecoleRoutes from './eleves-classes.js';
import { signer, authentifier, autoriser, peutVoirEleve } from './auth.js';

for (const v of ['DATABASE_URL', 'JWT_SECRET']) if (!process.env[v]) throw new Error(`Variable manquante : ${v}`);
const app = express();
app.set('trust proxy', 1);
app.use(helmet(), express.json({ limit: '1mb' }), cookieParser());

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ statut: 'ok' }); }
  catch { res.status(503).json({ statut: 'base indisponible' }); }
});

// 1er administrateur : une seule fois, protégé par SETUP_TOKEN
app.post('/api/setup', async (req, res) => {
  const d = z.object({ token: z.string(), email: z.string().email(), mot_de_passe: z.string().min(12), nom: z.string().min(1), prenom: z.string().min(1) }).safeParse(req.body);
  if (!d.success || !process.env.SETUP_TOKEN || d.data.token !== process.env.SETUP_TOKEN) return res.status(403).json({ erreur: 'Refusé' });
  if ((await pool.query('SELECT 1 FROM utilisateurs LIMIT 1')).rowCount) return res.status(409).json({ erreur: 'Déjà initialisé' });
  const h = await bcrypt.hash(d.data.mot_de_passe, 12);
  const { rows } = await pool.query("INSERT INTO utilisateurs(email,mot_de_passe_hash,role,nom,prenom) VALUES($1,$2,'admin',$3,$4) RETURNING id",
    [d.data.email.toLowerCase(), h, d.data.nom, d.data.prenom]);
  await audit(rows[0].id, 'creation_admin', 'utilisateurs', rows[0].id);
  res.status(201).json({ ok: true });
});

app.post('/api/login', rateLimit({ windowMs: 15 * 60e3, limit: 20 }), async (req, res) => {
  const d = z.object({ email: z.string().email(), mot_de_passe: z.string() }).safeParse(req.body);
  if (!d.success) return res.status(400).json({ erreur: 'Données invalides' });
  const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE email=$1 AND actif', [d.data.email.toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(d.data.mot_de_passe, u.mot_de_passe_hash))) return res.status(401).json({ erreur: 'Identifiants incorrects' });
  res.cookie('token', signer(u), { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600e3 });
  res.json({ id: u.id, role: u.role, nom: u.nom, prenom: u.prenom });
});
app.post('/api/logout', (_req, res) => res.clearCookie('token').json({ ok: true }));
app.get('/api/moi', authentifier, (req, res) => res.json(req.user));

app.post('/api/utilisateurs', authentifier, autoriser('admin'), async (req, res) => {
  const d = z.object({ email: z.string().email(), mot_de_passe: z.string().min(12), role: z.enum(['admin', 'enseignant', 'parent', 'eleve', 'comptable']), nom: z.string().min(1), prenom: z.string().min(1) }).safeParse(req.body);
  if (!d.success) return res.status(400).json({ erreur: 'Données invalides', details: d.error.issues });
  try {
    const h = await bcrypt.hash(d.data.mot_de_passe, 12);
    const { rows } = await pool.query('INSERT INTO utilisateurs(email,mot_de_passe_hash,role,nom,prenom) VALUES($1,$2,$3,$4,$5) RETURNING id,email,role',
      [d.data.email.toLowerCase(), h, d.data.role, d.data.nom, d.data.prenom]);
    if (d.data.role === 'enseignant') await pool.query('INSERT INTO enseignants(utilisateur_id) VALUES($1)', [rows[0].id]);
    if (d.data.role === 'parent') await pool.query('INSERT INTO parents(utilisateur_id) VALUES($1)', [rows[0].id]);
    await audit(req.user.id, 'creation', 'utilisateurs', rows[0].id, null, rows[0]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ erreur: e.code === '23505' ? 'E-mail déjà utilisé' : 'Erreur serveur' }); }
});

app.use('/api', ecoleRoutes); // v0.3 : élèves, classes, années (remplace la route /api/eleves/:id ci-dessous, conservée)
app.get('/api/eleves/:id', authentifier, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await peutVoirEleve(req.user, id))) return res.status(403).json({ erreur: 'Accès refusé' });
  const medical = req.user.role === 'admin' ? ', infos_medicales' : '';
  const { rows } = await pool.query(`SELECT id,nom,prenom,date_naissance${medical} FROM eleves WHERE id=$1 AND supprime_le IS NULL`, [id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ erreur: 'Introuvable' });
});


// --- Ajouts v0.2 ---
app.get('/api/setup/etat', async (_req, res) => {
  try { res.json({ initialise: (await pool.query('SELECT 1 FROM utilisateurs LIMIT 1')).rowCount > 0 }); }
  catch { res.status(503).json({ erreur: 'Base de données indisponible' }); }
});

// Statistiques du tableau de bord : chaque rôle ne reçoit que ses propres chiffres
app.get('/api/tableau-de-bord', authentifier, async (req, res) => {
  try {
    const n = async (sql, p = []) => Number((await pool.query(sql, p)).rows[0].n);
    const r = req.user.role, s = {};
    if (r === 'admin') {
      s.eleves = await n('SELECT count(*) n FROM eleves WHERE supprime_le IS NULL');
      s.classes = await n('SELECT count(*) n FROM classes');
      s.preinscriptions_en_attente = await n("SELECT count(*) n FROM preinscriptions WHERE statut='en_attente'");
    }
    if (r === 'admin' || r === 'comptable') {
      s.paiements_enregistres = await n('SELECT count(*) n FROM paiements WHERE annule_le IS NULL');
      s.total_paye_centimes = await n('SELECT COALESCE(sum(montant_centimes),0) n FROM paiements WHERE annule_le IS NULL');
    }
    if (r === 'parent') s.enfants = await n('SELECT count(*) n FROM parents_eleves pe JOIN parents p ON p.id=pe.parent_id WHERE p.utilisateur_id=$1', [req.user.id]);
    if (r === 'enseignant') s.classes = await n('SELECT count(DISTINCT af.classe_id) n FROM affectations_enseignants af JOIN enseignants e ON e.id=af.enseignant_id WHERE e.utilisateur_id=$1', [req.user.id]);
    res.json(s);
  } catch { res.status(500).json({ erreur: 'Erreur serveur' }); }
});

// Frontend React compilé (client/dist), servi par le même serveur
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
app.use(express.static(dist));
app.get(/^\/(?!api|health).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html'), (e) => e && res.status(404).send('Frontend non compilé : lancez npm run build')));

app.listen(process.env.PORT || 3000, () => console.log('API démarrée'));
