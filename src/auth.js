import jwt from 'jsonwebtoken';
import { pool } from './db.js';
export const signer = (u) => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
export async function authentifier(req, res, next) {
  try {
    const { id } = jwt.verify(req.cookies.token || '', process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT id,email,role,nom,prenom FROM utilisateurs WHERE id=$1 AND actif', [id]);
    if (!rows[0]) throw new Error();
    req.user = rows[0]; next();
  } catch { res.status(401).json({ erreur: 'Authentification requise' }); }
}
export const autoriser = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ erreur: 'Accès refusé' });

// Contrôle d'accès par objet : empêche de voir un autre élève en changeant l'URL
export async function peutVoirEleve(user, eleveId) {
  if (['admin', 'comptable'].includes(user.role)) return true;
  const q = {
    parent: 'SELECT 1 FROM parents_eleves pe JOIN parents p ON p.id=pe.parent_id WHERE p.utilisateur_id=$1 AND pe.eleve_id=$2',
    eleve: 'SELECT 1 FROM eleves WHERE utilisateur_id=$1 AND id=$2',
    enseignant: `SELECT 1 FROM affectations_eleves ae JOIN affectations_enseignants af ON af.classe_id=ae.classe_id
      JOIN enseignants e ON e.id=af.enseignant_id WHERE e.utilisateur_id=$1 AND ae.eleve_id=$2`,
  }[user.role];
  return q ? (await pool.query(q, [user.id, eleveId])).rowCount > 0 : false;
}
