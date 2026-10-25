import { useEffect, useState } from 'react';
import { api } from './api.js';
import Eleves from './Eleves.jsx';
import Classes from './Classes.jsx';

const ROLES = { admin: 'Administrateur / Direction', enseignant: 'Enseignant', parent: 'Parent', eleve: 'Élève', comptable: 'Comptable / Secrétariat' };
// Le filtrage par rôle ici n'est qu'un confort d'affichage : la vraie protection est dans le backend.
const MODULES = [
  { id: 'tableau', nom: 'Tableau de bord' },
  { id: 'eleves', nom: 'Élèves', roles: ['admin', 'comptable', 'enseignant'] },
  { id: 'classes', nom: 'Classes', roles: ['admin', 'enseignant'] },
  { id: 'matieres', nom: 'Matières', roles: ['admin', 'enseignant'] },
  { id: 'enseignants', nom: 'Enseignants', roles: ['admin'] },
  { id: 'preinscriptions', nom: 'Préinscriptions', roles: ['admin'] },
  { id: 'notes', nom: 'Notes et bulletins', roles: ['admin', 'enseignant', 'parent', 'eleve'] },
  { id: 'paiements', nom: 'Paiements et reçus', roles: ['admin', 'comptable', 'parent'] },
  { id: 'comptes', nom: 'Comptes utilisateurs', roles: ['admin'] },
];
const STATS = {
  eleves: 'Élèves inscrits', classes: 'Classes', preinscriptions_en_attente: 'Préinscriptions en attente',
  paiements_enregistres: 'Paiements enregistrés', total_paye_centimes: 'Total encaissé', enfants: 'Enfants rattachés',
};
const fmt = (k, v) => k.endsWith('_centimes') ? (v / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) : v.toLocaleString('fr-FR');

function Champ({ label, ...p }) {
  return <><label htmlFor={p.name}>{label}</label><input id={p.name} {...p} /></>;
}
function Message({ type, children }) {
  return children ? <div className={`msg ${type}`} role={type === 'err' ? 'alert' : 'status'}>{children}</div> : null;
}

function Connexion({ onConnecte }) {
  const [f, setF] = useState({ email: '', mot_de_passe: '' });
  const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false);
  const maj = (e) => setF({ ...f, [e.target.name]: e.target.value });
  async function envoyer(e) {
    e.preventDefault(); setErr(''); setOccupe(true);
    try { await api('/api/login', { method: 'POST', body: f }); onConnecte(await api('/api/moi')); }
    catch (x) { setErr(x.message); } finally { setOccupe(false); }
  }
  return (
    <main className="centre"><form className="carte connexion form" onSubmit={envoyer}>
      <h1>Gestion de l’école</h1><p className="aide">Connectez-vous avec le compte fourni par l’administration.</p>
      <Champ label="Adresse e-mail" name="email" type="email" autoComplete="username" required value={f.email} onChange={maj} />
      <Champ label="Mot de passe" name="mot_de_passe" type="password" autoComplete="current-password" required value={f.mot_de_passe} onChange={maj} />
      <Message type="err">{err}</Message>
      <button type="submit" disabled={occupe}>{occupe ? 'Connexion…' : 'Se connecter'}</button>
    </form></main>
  );
}

function Initialisation({ onFait }) {
  const [f, setF] = useState({ token: '', prenom: '', nom: '', email: '', mot_de_passe: '' });
  const [err, setErr] = useState(''); const [occupe, setOccupe] = useState(false);
  const maj = (e) => setF({ ...f, [e.target.name]: e.target.value });
  async function envoyer(e) {
    e.preventDefault(); setErr(''); setOccupe(true);
    try { await api('/api/setup', { method: 'POST', body: f }); onFait(); }
    catch (x) { setErr(x.status === 403 ? 'Jeton ou informations refusés. Vérifiez SETUP_TOKEN (mot de passe : 12 caractères minimum).' : x.message); }
    finally { setOccupe(false); }
  }
  return (
    <main className="centre"><form className="carte connexion form" onSubmit={envoyer}>
      <h1>Première installation</h1>
      <p className="aide">Créez le compte administrateur. Le jeton est la valeur de SETUP_TOKEN définie dans votre fichier .env.</p>
      <Champ label="Jeton d’installation" name="token" type="password" required value={f.token} onChange={maj} />
      <Champ label="Prénom" name="prenom" required value={f.prenom} onChange={maj} />
      <Champ label="Nom" name="nom" required value={f.nom} onChange={maj} />
      <Champ label="Adresse e-mail" name="email" type="email" required value={f.email} onChange={maj} />
      <Champ label="Mot de passe (12 caractères minimum)" name="mot_de_passe" type="password" minLength={12} autoComplete="new-password" required value={f.mot_de_passe} onChange={maj} />
      <Message type="err">{err}</Message>
      <button type="submit" disabled={occupe}>Créer l’administrateur</button>
    </form></main>
  );
}

function Tableau({ user, onExpire }) {
  const [stats, setStats] = useState(null); const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/tableau-de-bord').then(setStats).catch((x) => (x.status === 401 ? onExpire() : setErr(x.message)));
  }, []);
  return (
    <>
      <h1>Bonjour {user.prenom}</h1>
      <span className="badge">{ROLES[user.role]}</span>
      <Message type="err">{err}</Message>
      {stats && (Object.keys(stats).length ? (
        <div className="grille">{Object.entries(stats).map(([k, v]) => (
          <div className="carte stat" key={k}><div className="val">{fmt(k, v)}</div><div className="lib">{STATS[k] || k}</div></div>
        ))}</div>
      ) : <p className="carte">Aucun indicateur n’est disponible pour votre rôle pour le moment.</p>)}
      <p className="aide">Ces chiffres viennent de la base de données. Ils seront à 0 tant que les modules de saisie ne sont pas construits.</p>
    </>
  );
}

function Comptes() {
  const vide = { prenom: '', nom: '', email: '', mot_de_passe: '', role: 'enseignant' };
  const [f, setF] = useState(vide); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const maj = (e) => setF({ ...f, [e.target.name]: e.target.value });
  async function envoyer(e) {
    e.preventDefault(); setErr(''); setOk('');
    try { const u = await api('/api/utilisateurs', { method: 'POST', body: f }); setOk(`Compte créé : ${u.email} (${ROLES[u.role]})`); setF(vide); }
    catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h1>Comptes utilisateurs</h1><p className="aide">Création de comptes par l’administration. Communiquez le mot de passe à la personne par un canal sûr.</p>
      <form className="carte form" style={{ maxWidth: 460 }} onSubmit={envoyer}>
        <Champ label="Prénom" name="prenom" required value={f.prenom} onChange={maj} />
        <Champ label="Nom" name="nom" required value={f.nom} onChange={maj} />
        <Champ label="Adresse e-mail" name="email" type="email" required value={f.email} onChange={maj} />
        <Champ label="Mot de passe provisoire (12 caractères minimum)" name="mot_de_passe" type="password" minLength={12} autoComplete="new-password" required value={f.mot_de_passe} onChange={maj} />
        <label htmlFor="role">Rôle</label>
        <select id="role" name="role" value={f.role} onChange={maj}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <Message type="err">{err}</Message><Message type="ok">{ok}</Message>
        <button type="submit">Créer le compte</button>
      </form>
    </>
  );
}

function APrevoir({ nom }) {
  return <><h1>{nom}</h1><p className="carte">Ce module n’est pas encore disponible : l’API correspondante n’existe pas encore dans le backend. Il sera construit lors d’une prochaine étape.</p></>;
}

function Coque({ user, onSortie }) {
  const [page, setPage] = useState(location.hash.slice(1) || 'tableau');
  const [menu, setMenu] = useState(false);
  useEffect(() => { const h = () => { setPage(location.hash.slice(1) || 'tableau'); setMenu(false); }; addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  const visibles = MODULES.filter((m) => !m.roles || m.roles.includes(user.role));
  const courant = visibles.find((m) => m.id === page) || visibles[0];
  async function quitter() { await api('/api/logout', { method: 'POST' }).catch(() => {}); onSortie(); }
  return (
    <div className="coque">
      <div className="barre"><strong>Gestion de l’école</strong><button onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="nav">Menu</button></div>
      <nav id="nav" className={`lateral${menu ? ' ouvert' : ''}`} aria-label="Navigation principale">
        <div className="marque">École primaire</div>
        {visibles.map((m) => <a key={m.id} href={`#${m.id}`} aria-current={m.id === courant.id ? 'page' : undefined}>{m.nom}</a>)}
        <div className="bas">{user.prenom} {user.nom}<br />{ROLES[user.role]}<button onClick={quitter}>Se déconnecter</button></div>
      </nav>
      <main className="principal">
        {courant.id === 'tableau' ? <Tableau user={user} onExpire={onSortie} /> : courant.id === 'comptes' ? <Comptes /> : courant.id === 'eleves' ? <Eleves user={user} /> : courant.id === 'classes' ? <Classes user={user} /> : <APrevoir nom={courant.nom} />}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = chargement
  const [initialise, setInitialise] = useState(true);
  const [panne, setPanne] = useState('');
  async function charger() {
    try { setUser(await api('/api/moi')); }
    catch (x) {
      if (x.status !== 401) return setPanne(x.message);
      setUser(null);
      api('/api/setup/etat').then((r) => setInitialise(r.initialise)).catch((e) => setPanne(e.message));
    }
  }
  useEffect(() => { charger(); }, []);
  if (panne) return <main className="centre"><div className="carte"><Message type="err">{panne}</Message></div></main>;
  if (user === undefined) return <main className="centre"><p>Chargement…</p></main>;
  if (user) return <Coque user={user} onSortie={() => setUser(null)} />;
  return initialise ? <Connexion onConnecte={setUser} /> : <Initialisation onFait={() => setInitialise(true)} />;
}
