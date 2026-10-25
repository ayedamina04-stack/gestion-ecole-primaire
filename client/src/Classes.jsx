import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { Champ, Message, fmtDate, nulls } from './ui.jsx';

function AnneeForm({ fait }) {
  const [f, setF] = useState({ code: '', debut: '', fin: '', active: true }); const [err, setErr] = useState('');
  const maj = (e) => setF({ ...f, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function envoyer(e) { e.preventDefault(); setErr(''); try { await api('/api/annees', { method: 'POST', body: f }); fait(); } catch (x) { setErr(x.message); } }
  return (
    <form className="carte form" style={{ maxWidth: 420, marginBottom: '1rem' }} onSubmit={envoyer}>
      <h2>Nouvelle année scolaire</h2>
      <Champ label="Code (ex. 2025-2026)" name="code" required pattern="\d{4}-\d{4}" value={f.code} onChange={maj} />
      <Champ label="Début" name="debut" type="date" required value={f.debut} onChange={maj} />
      <Champ label="Fin" name="fin" type="date" required value={f.fin} onChange={maj} />
      <label><input type="checkbox" name="active" checked={f.active} onChange={maj} style={{ width: 'auto' }} /> Année active</label>
      <Message type="err">{err}</Message><button type="submit">Créer l’année</button>
    </form>
  );
}

function Liste({ admin, aller }) {
  const [ref, setRef] = useState(null); const [annee, setAnnee] = useState(''); const [classes, setClasses] = useState(null);
  const [err, setErr] = useState(''); const [afficherAnnee, setAfficherAnnee] = useState(false);
  const chargerRef = useCallback(() => api('/api/referentiels').then((r) => { setRef(r); setAnnee((a) => a || r.annees.find((x) => x.active)?.code || r.annees[0]?.code || ''); setAfficherAnnee(false); }).catch((x) => setErr(x.message)), []);
  useEffect(() => { chargerRef(); }, [chargerRef]);
  const charger = useCallback(() => api(`/api/classes${annee ? `?annee=${annee}` : ''}`).then((r) => { setClasses(r); setErr(''); }).catch((x) => setErr(x.message)), [annee]);
  useEffect(() => { if (ref) charger(); }, [ref, charger]);
  async function supprimer(c) {
    if (!window.confirm(`Supprimer la classe ${c.niveau} ${c.section} (${c.annee_scolaire}) ?`)) return;
    try { await api(`/api/classes/${c.id}`, { method: 'DELETE' }); charger(); } catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h1>Classes</h1>
      {admin && (afficherAnnee || (ref && ref.annees.length === 0)) && <AnneeForm fait={chargerRef} />}
      <div className="outils">
        <div><label htmlFor="an">Année scolaire</label>
          <select id="an" value={annee} onChange={(e) => setAnnee(e.target.value)}><option value="">Toutes</option>{ref?.annees.map((a) => <option key={a.code} value={a.code}>{a.code}{a.active ? ' (active)' : ''}</option>)}</select></div>
        {admin && <><button className="sec" onClick={() => setAfficherAnnee(true)}>Nouvelle année scolaire</button>
          <button disabled={!ref?.annees.length} onClick={() => aller({ v: 'form' })}>Ajouter une classe</button></>}
      </div>
      <Message type="err">{err}</Message>
      {classes && <div className="carte tableau"><table>
        <thead><tr><th>Niveau</th><th>Section</th><th>Année</th><th>Effectif</th><th>Titulaire</th><th>Actions</th></tr></thead>
        <tbody>{classes.length === 0 && <tr><td colSpan="6">Aucune classe.</td></tr>}
          {classes.map((c) => <tr key={c.id}><td>{c.niveau}</td><td>{c.section}</td><td>{c.annee_scolaire}</td><td>{c.effectif} / {c.capacite}</td><td>{c.titulaire || '—'}</td>
            <td className="actions"><button className="sec" onClick={() => aller({ v: 'fiche', id: c.id })}>Voir</button>
              {admin && <><button className="sec" onClick={() => aller({ v: 'form', id: c.id })}>Modifier</button><button className="danger" onClick={() => supprimer(c)}>Supprimer</button></>}</td></tr>)}</tbody></table></div>}
    </>
  );
}

function Formulaire({ id, retour }) {
  const [f, setF] = useState({ annee_scolaire: '', niveau: '', section: 'A', capacite: 25, titulaire_id: '' });
  const [ref, setRef] = useState({ annees: [], enseignants: [] }); const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/referentiels').then((r) => { setRef(r); if (!id) setF((o) => ({ ...o, annee_scolaire: r.annees.find((a) => a.active)?.code || r.annees[0]?.code || '' })); }).catch((x) => setErr(x.message));
    if (id) api(`/api/classes/${id}`).then((c) => setF({ annee_scolaire: c.annee_scolaire, niveau: c.niveau, section: c.section, capacite: c.capacite, titulaire_id: c.titulaire_id ?? '' })).catch((x) => setErr(x.message));
  }, [id]);
  const maj = (e) => setF({ ...f, [e.target.name]: e.target.value });
  async function envoyer(e) {
    e.preventDefault(); setErr('');
    try { await api(id ? `/api/classes/${id}` : '/api/classes', { method: id ? 'PUT' : 'POST', body: { ...nulls(f), capacite: Number(f.capacite), titulaire_id: f.titulaire_id ? Number(f.titulaire_id) : null } }); retour(); }
    catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h1>{id ? 'Modifier la classe' : 'Nouvelle classe'}</h1>
      <form className="carte form" style={{ maxWidth: 480 }} onSubmit={envoyer}>
        <label htmlFor="annee_scolaire">Année scolaire *</label>
        <select id="annee_scolaire" name="annee_scolaire" required value={f.annee_scolaire} onChange={maj}>{ref.annees.map((a) => <option key={a.code}>{a.code}</option>)}</select>
        <Champ label="Niveau * (ex. CP, CE1, CM2)" name="niveau" required maxLength={50} value={f.niveau} onChange={maj} />
        <Champ label="Section *" name="section" required maxLength={10} value={f.section} onChange={maj} />
        <Champ label="Capacité maximale *" name="capacite" type="number" min="1" max="100" required value={f.capacite} onChange={maj} />
        <label htmlFor="titulaire_id">Enseignant titulaire</label>
        <select id="titulaire_id" name="titulaire_id" value={f.titulaire_id} onChange={maj}><option value="">Aucun</option>{ref.enseignants.map((t) => <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>)}</select>
        {ref.enseignants.length === 0 && <p className="aide">Aucun enseignant : créez un compte « Enseignant » dans Comptes utilisateurs.</p>}
        <Message type="err">{err}</Message>
        <button type="submit">Enregistrer</button> <button type="button" className="sec" onClick={retour}>Annuler</button>
      </form>
    </>
  );
}

function Fiche({ id, admin, aller, retour }) {
  const [c, setC] = useState(null); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const charger = useCallback(() => api(`/api/classes/${id}`).then(setC).catch((x) => setErr(x.message)), [id]);
  useEffect(() => { charger(); }, [charger]);
  async function retirer(e) {
    if (!window.confirm(`Retirer ${e.prenom} ${e.nom} de cette classe ?`)) return;
    try { await api(`/api/eleves/${e.id}/classe/${c.annee_scolaire}`, { method: 'DELETE' }); setOk('Élève retiré de la classe.'); charger(); } catch (x) { setErr(x.message); }
  }
  return (
    <>
      <button className="sec" onClick={retour}>← Retour à la liste</button>
      <Message type="err">{err}</Message><Message type="ok">{ok}</Message>
      {c && <>
        <h1>Classe {c.niveau} {c.section}</h1>
        <div className="carte"><dl><dt>Année scolaire</dt><dd>{c.annee_scolaire}</dd><dt>Effectif</dt><dd>{c.effectif} / {c.capacite}</dd><dt>Enseignant titulaire</dt><dd>{c.titulaire || '—'}</dd></dl>
          {admin && <button onClick={() => aller({ v: 'form', id })}>Modifier</button>}</div>
        <div className="carte tableau" style={{ marginTop: '1rem' }}><h2>Élèves de la classe</h2>
          <table><thead><tr><th>Nom</th><th>Prénom</th><th>Naissance</th>{admin && <th>Actions</th>}</tr></thead>
            <tbody>{c.eleves.length === 0 && <tr><td colSpan="4">Aucun élève dans cette classe.</td></tr>}
              {c.eleves.map((e) => <tr key={e.id}><td>{e.nom}</td><td>{e.prenom}</td><td>{fmtDate(e.date_naissance)}</td>
                {admin && <td className="actions"><button className="danger" onClick={() => retirer(e)}>Retirer</button></td>}</tr>)}</tbody></table>
          {admin && <p className="aide">Pour affecter un élève, ouvrez sa fiche dans le module Élèves.</p>}</div></>}
    </>
  );
}

export default function Classes({ user }) {
  const [vue, setVue] = useState({ v: 'liste' }); const admin = user.role === 'admin';
  const retour = () => setVue({ v: 'liste' });
  if (vue.v === 'form' && admin) return <Formulaire id={vue.id} retour={retour} />;
  if (vue.v === 'fiche') return <Fiche id={vue.id} admin={admin} aller={setVue} retour={retour} />;
  return <Liste admin={admin} aller={setVue} />;
}
