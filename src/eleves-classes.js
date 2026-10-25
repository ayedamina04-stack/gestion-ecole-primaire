// Modules Élèves et Classes (v0.3). Authentification et rôles vérifiés route par route.
import { Router } from 'express';
import { z } from 'zod';
import { pool, audit } from './db.js';
import { authentifier, autoriser, peutVoirEleve } from './auth.js';

const r = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class Http extends Error { constructor(status, message) { super(message); this.status = status; } }
const lecture = [authentifier, autoriser('admin', 'comptable', 'enseignant')];
const ecriture = [authentifier, autoriser('admin')];
const entier = z.coerce.number().int().positive();
const idParam = (req) => entier.parse(req.params.id);
const anneeRe = z.string().regex(/^\d{4}-\d{4}$/);
const texte = (max) => z.string().trim().min(1).max(max);
const optTexte = (max) => z.string().trim().max(max).nullish();

// Classes d'un enseignant (affectations + titulariat). null = pas de restriction.
async function classesDe(u) {
  if (u.role !== 'enseignant') return null;
  const { rows } = await pool.query(
    `SELECT af.classe_id id FROM affectations_enseignants af JOIN enseignants e ON e.id=af.enseignant_id WHERE e.utilisateur_id=$1
     UNION SELECT c.id FROM classes c JOIN enseignants e ON e.id=c.titulaire_id WHERE e.utilisateur_id=$1`, [u.id]);
  return rows.map((x) => x.id);
}
async function peutVoir(u, eleveId) {
  if (u.role === 'enseignant') {
    const ids = await classesDe(u);
    return ids.length > 0 && (await pool.query('SELECT 1 FROM affectations_eleves WHERE eleve_id=$1 AND classe_id=ANY($2::int[])', [eleveId, ids])).rowCount > 0;
  }
  return peutVoirEleve(u, eleveId);
}

// ---------- Références (années scolaires, enseignants) ----------
r.get('/referentiels', ...lecture, ah(async (req, res) => {
  const annees = (await pool.query("SELECT code, to_char(debut,'YYYY-MM-DD') debut, to_char(fin,'YYYY-MM-DD') fin, active FROM annees_scolaires ORDER BY code DESC")).rows;
  const enseignants = req.user.role === 'admin'
    ? (await pool.query('SELECT e.id,u.nom,u.prenom FROM enseignants e JOIN utilisateurs u ON u.id=e.utilisateur_id WHERE u.actif ORDER BY u.nom,u.prenom')).rows : [];
  res.json({ annees, enseignants });
}));
r.post('/annees', ...ecriture, ah(async (req, res) => {
  const d = z.object({ code: anneeRe, debut: z.string().date(), fin: z.string().date(), active: z.boolean().default(false) })
    .refine((x) => x.debut < x.fin, { path: ['fin'] }).parse(req.body);
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    if (d.active) await cx.query('UPDATE annees_scolaires SET active=false');
    await cx.query('INSERT INTO annees_scolaires(code,debut,fin,active) VALUES($1,$2,$3,$4)', [d.code, d.debut, d.fin, d.active]);
    await cx.query('COMMIT');
  } catch (e) { await cx.query('ROLLBACK').catch(() => {}); throw e; } finally { cx.release(); }
  await audit(req.user.id, 'creation', 'annees_scolaires', d.code, null, d);
  res.status(201).json(d);
}));

// ---------- Classes ----------
const SEL = `SELECT c.id,c.annee_scolaire,c.niveau,c.section,c.capacite,c.titulaire_id, u.prenom||' '||u.nom AS titulaire,
  (SELECT count(*) FROM affectations_eleves ae JOIN eleves el ON el.id=ae.eleve_id AND el.supprime_le IS NULL WHERE ae.classe_id=c.id)::int AS effectif
  FROM classes c LEFT JOIN enseignants e ON e.id=c.titulaire_id LEFT JOIN utilisateurs u ON u.id=e.utilisateur_id`;
const classeSchema = z.object({ annee_scolaire: anneeRe, niveau: texte(50), section: texte(10).default('A'),
  capacite: z.coerce.number().int().min(1).max(100), titulaire_id: entier.nullish() });

r.get('/classes', ...lecture, ah(async (req, res) => {
  const q = z.object({ annee: anneeRe.optional() }).parse(req.query);
  const w = [], p = [];
  if (q.annee) { p.push(q.annee); w.push(`c.annee_scolaire=$${p.length}`); }
  const ids = await classesDe(req.user);
  if (ids) { p.push(ids); w.push(`c.id=ANY($${p.length}::int[])`); }
  res.json((await pool.query(`${SEL} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.annee_scolaire DESC,c.niveau,c.section`, p)).rows);
}));
r.get('/classes/:id', ...lecture, ah(async (req, res) => {
  const id = idParam(req), ids = await classesDe(req.user);
  if (ids && !ids.includes(id)) throw new Http(403, 'Accès refusé');
  const c = (await pool.query(`${SEL} WHERE c.id=$1`, [id])).rows[0];
  if (!c) throw new Http(404, 'Classe introuvable');
  const eleves = (await pool.query(`SELECT el.id,el.nom,el.prenom,to_char(el.date_naissance,'YYYY-MM-DD') date_naissance
    FROM affectations_eleves ae JOIN eleves el ON el.id=ae.eleve_id WHERE ae.classe_id=$1 AND el.supprime_le IS NULL ORDER BY el.nom,el.prenom`, [id])).rows;
  res.json({ ...c, eleves });
}));
r.post('/classes', ...ecriture, ah(async (req, res) => {
  const d = classeSchema.parse(req.body);
  const { rows } = await pool.query('INSERT INTO classes(annee_scolaire,niveau,section,capacite,titulaire_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [d.annee_scolaire, d.niveau, d.section, d.capacite, d.titulaire_id ?? null]);
  await audit(req.user.id, 'creation', 'classes', rows[0].id, null, rows[0]);
  res.status(201).json(rows[0]);
}));
r.put('/classes/:id', ...ecriture, ah(async (req, res) => {
  const id = idParam(req), d = classeSchema.parse(req.body);
  const avant = (await pool.query(`${SEL} WHERE c.id=$1`, [id])).rows[0];
  if (!avant) throw new Http(404, 'Classe introuvable');
  if (d.capacite < avant.effectif) throw new Http(409, `La capacité ne peut pas être inférieure à l’effectif actuel (${avant.effectif}).`);
  if (d.annee_scolaire !== avant.annee_scolaire && avant.effectif > 0) throw new Http(409, 'Impossible de changer l’année scolaire d’une classe qui contient des élèves.');
  const { rows } = await pool.query('UPDATE classes SET annee_scolaire=$1,niveau=$2,section=$3,capacite=$4,titulaire_id=$5 WHERE id=$6 RETURNING *',
    [d.annee_scolaire, d.niveau, d.section, d.capacite, d.titulaire_id ?? null, id]);
  await audit(req.user.id, 'modification', 'classes', id, avant, rows[0]);
  res.json(rows[0]);
}));
r.delete('/classes/:id', ...ecriture, ah(async (req, res) => {
  const id = idParam(req);
  const c = (await pool.query('SELECT * FROM classes WHERE id=$1', [id])).rows[0];
  if (!c) throw new Http(404, 'Classe introuvable');
  const n = async (t) => (await pool.query(`SELECT count(*)::int n FROM ${t} WHERE classe_id=$1`, [id])).rows[0].n;
  const [el, en, ev] = [await n('affectations_eleves'), await n('affectations_enseignants'), await n('evaluations')];
  if (el + en + ev > 0) throw new Http(409, `Suppression impossible : la classe est liée à ${el} affectation(s) d’élèves, ${en} affectation(s) d’enseignants et ${ev} évaluation(s). Réaffectez ou retirez d’abord ces éléments.`);
  await pool.query('DELETE FROM classes WHERE id=$1', [id]);
  await audit(req.user.id, 'suppression', 'classes', id, c, null);
  res.json({ ok: true });
}));

// ---------- Élèves ----------
const eleveSchema = z.object({ nom: texte(100), prenom: texte(100),
  date_naissance: z.string().date().refine((d) => d <= new Date().toISOString().slice(0, 10), 'future'),
  adresse: optTexte(300), infos_medicales: optTexte(2000), annee_entree: anneeRe.nullish() });
const PAR_PAGE = 20;

r.get('/eleves', ...lecture, ah(async (req, res) => {
  const q = z.object({ q: z.string().trim().max(100).optional(), classe_id: entier.optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
  const w = ['el.supprime_le IS NULL'], p = [];
  if (q.q) { p.push(`%${q.q.replace(/[%_\\]/g, '\\$&')}%`); w.push(`(el.nom ILIKE $${p.length} OR el.prenom ILIKE $${p.length})`); }
  if (q.classe_id) { p.push(q.classe_id); w.push(`ae.classe_id=$${p.length}`); }
  const ids = await classesDe(req.user);
  if (ids) { p.push(ids); w.push(`ae.classe_id=ANY($${p.length}::int[])`); }
  const from = `FROM eleves el LEFT JOIN affectations_eleves ae ON ae.eleve_id=el.id AND ae.annee_scolaire=(SELECT code FROM annees_scolaires WHERE active LIMIT 1)
    LEFT JOIN classes c ON c.id=ae.classe_id WHERE ${w.join(' AND ')}`;
  const total = (await pool.query(`SELECT count(*)::int n ${from}`, p)).rows[0].n;
  const items = (await pool.query(`SELECT el.id,el.nom,el.prenom,to_char(el.date_naissance,'YYYY-MM-DD') date_naissance, c.id classe_id, c.niveau||' '||c.section AS classe
    ${from} ORDER BY el.nom,el.prenom LIMIT ${PAR_PAGE} OFFSET $${p.length + 1}`, [...p, (q.page - 1) * PAR_PAGE])).rows;
  res.json({ items, total, page: q.page, pages: Math.max(1, Math.ceil(total / PAR_PAGE)) });
}));
r.get('/eleves/:id', authentifier, ah(async (req, res) => {
  const id = idParam(req), role = req.user.role;
  if (!(await peutVoir(req.user, id))) throw new Http(403, 'Accès refusé');
  const cols = `id,nom,prenom,to_char(date_naissance,'YYYY-MM-DD') date_naissance${['admin', 'comptable'].includes(role) ? ',adresse,annee_entree' : ''}${role === 'admin' ? ',infos_medicales' : ''}`;
  const el = (await pool.query(`SELECT ${cols} FROM eleves WHERE id=$1 AND supprime_le IS NULL`, [id])).rows[0];
  if (!el) throw new Http(404, 'Élève introuvable');
  const affectations = (await pool.query(`SELECT ae.annee_scolaire,c.id classe_id,c.niveau,c.section FROM affectations_eleves ae JOIN classes c ON c.id=ae.classe_id
    WHERE ae.eleve_id=$1 ORDER BY ae.annee_scolaire DESC`, [id])).rows;
  res.json({ ...el, affectations });
}));
r.post('/eleves', ...ecriture, ah(async (req, res) => {
  const d = eleveSchema.parse(req.body);
  const { rows } = await pool.query('INSERT INTO eleves(nom,prenom,date_naissance,adresse,infos_medicales,annee_entree) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [d.nom, d.prenom, d.date_naissance, d.adresse ?? null, d.infos_medicales ?? null, d.annee_entree ?? null]);
  await audit(req.user.id, 'creation', 'eleves', rows[0].id, null, { ...d, infos_medicales: d.infos_medicales ? '[renseignées]' : null });
  res.status(201).json(rows[0]);
}));
r.put('/eleves/:id', ...ecriture, ah(async (req, res) => {
  const id = idParam(req), d = eleveSchema.parse(req.body);
  const avant = (await pool.query('SELECT nom,prenom,date_naissance,adresse,annee_entree FROM eleves WHERE id=$1 AND supprime_le IS NULL', [id])).rows[0];
  if (!avant) throw new Http(404, 'Élève introuvable');
  await pool.query('UPDATE eleves SET nom=$1,prenom=$2,date_naissance=$3,adresse=$4,infos_medicales=$5,annee_entree=$6 WHERE id=$7',
    [d.nom, d.prenom, d.date_naissance, d.adresse ?? null, d.infos_medicales ?? null, d.annee_entree ?? null, id]);
  await audit(req.user.id, 'modification', 'eleves', id, avant, { nom: d.nom, prenom: d.prenom, date_naissance: d.date_naissance, adresse: d.adresse, annee_entree: d.annee_entree });
  res.json({ ok: true });
}));
// Suppression logique : l'historique (affectations, notes, paiements) est conservé.
r.delete('/eleves/:id', ...ecriture, ah(async (req, res) => {
  const id = idParam(req);
  const { rowCount } = await pool.query('UPDATE eleves SET supprime_le=now() WHERE id=$1 AND supprime_le IS NULL', [id]);
  if (!rowCount) throw new Http(404, 'Élève introuvable');
  await audit(req.user.id, 'suppression_logique', 'eleves', id);
  res.json({ ok: true });
}));

// Affectation à une classe (l'année scolaire est celle de la classe) avec contrôle de capacité
r.put('/eleves/:id/classe', ...ecriture, ah(async (req, res) => {
  const id = idParam(req), { classe_id } = z.object({ classe_id: entier }).parse(req.body);
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const c = (await cx.query('SELECT id,annee_scolaire,capacite FROM classes WHERE id=$1 FOR UPDATE', [classe_id])).rows[0];
    if (!c) throw new Http(404, 'Classe introuvable');
    if (!(await cx.query('SELECT 1 FROM eleves WHERE id=$1 AND supprime_le IS NULL', [id])).rowCount) throw new Http(404, 'Élève introuvable');
    const { n } = (await cx.query(`SELECT count(*)::int n FROM affectations_eleves ae JOIN eleves el ON el.id=ae.eleve_id AND el.supprime_le IS NULL
      WHERE ae.classe_id=$1 AND ae.eleve_id<>$2`, [classe_id, id])).rows[0];
    if (n >= c.capacite) throw new Http(409, `Cette classe est complète (${c.capacite} places).`);
    const avant = (await cx.query('SELECT classe_id FROM affectations_eleves WHERE eleve_id=$1 AND annee_scolaire=$2', [id, c.annee_scolaire])).rows[0];
    await cx.query(`INSERT INTO affectations_eleves(annee_scolaire,eleve_id,classe_id) VALUES($1,$2,$3)
      ON CONFLICT (annee_scolaire,eleve_id) DO UPDATE SET classe_id=EXCLUDED.classe_id`, [c.annee_scolaire, id, classe_id]);
    await cx.query('COMMIT');
    await audit(req.user.id, 'affectation_classe', 'eleves', id, avant ?? null, { classe_id, annee_scolaire: c.annee_scolaire });
    res.json({ ok: true });
  } catch (e) { await cx.query('ROLLBACK').catch(() => {}); throw e; } finally { cx.release(); }
}));
r.delete('/eleves/:id/classe/:annee', ...ecriture, ah(async (req, res) => {
  const id = idParam(req), annee = anneeRe.parse(req.params.annee);
  const { rows } = await pool.query('DELETE FROM affectations_eleves WHERE eleve_id=$1 AND annee_scolaire=$2 RETURNING classe_id', [id, annee]);
  if (!rows[0]) throw new Http(404, 'Affectation introuvable');
  await audit(req.user.id, 'retrait_classe', 'eleves', id, { ...rows[0], annee_scolaire: annee }, null);
  res.json({ ok: true });
}));

r.use((e, _req, res, _next) => {
  if (e instanceof z.ZodError) return res.status(400).json({ erreur: 'Données invalides : ' + [...new Set(e.issues.map((i) => i.path.join('.') || 'requête'))].join(', ') });
  if (e.status) return res.status(e.status).json({ erreur: e.message });
  if (e.code === '23505') return res.status(409).json({ erreur: 'Cet enregistrement existe déjà (même année, niveau et section).' });
  if (e.code === '23503') return res.status(409).json({ erreur: 'Référence invalide (année scolaire ou enseignant inexistant) ou enregistrement encore utilisé.' });
  console.error(e);
  res.status(500).json({ erreur: 'Erreur serveur' });
});
export default r;
