import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { Champ, Message, fmtDate, nulls } from './ui.jsx';

function Liste({ admin, aller }) {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const charger = useCallback(() => api(`/api/eleves?${new URLSearchParams({ q, page })}`).then((r) => { setD(r); setErr(''); }).catch((x) => setErr(x.message)), [q, page]);
  useEffect(() => { const t = setTimeout(charger, 250); return () => clearTimeout(t); }, [charger]);
  async function supprimer(e) {
    if (!window.confirm(`Supprimer l’élève ${e.prenom} ${e.nom} ?\nL’élève n’apparaîtra plus dans les listes ; son historique est conservé.`)) return;
    try { await api(`/api/eleves/${e.id}`, { method: 'DELETE' }); charger(); } catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h1>Élèves</h1>
      <div className="outils">
        <div><label htmlFor="rech">Rechercher (nom ou prénom)</label>
          <input id="rech" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        {admin && <button onClick={() => aller({ v: 'form' })}>Ajouter un élève</button>}
      </div>
      <Message type="err">{err}</Message>
      {d && <div className="carte tableau"><table>
        <thead><tr><th>Nom</th><th>Prénom</th><th>Naissance</th><th>Classe</th><th>Actions</th></tr></thead>
        <tbody>{d.items.length === 0 && <tr><td colSpan="5">Aucun élève trouvé.</td></tr>}
          {d.items.map((e) => <tr key={e.id}><td>{e.nom}</td><td>{e.prenom}</td><td>{fmtDate(e.date_naissance)}</td><td>{e.classe || '—'}</td>
            <td className="actions"><button className="sec" onClick={() => aller({ v: 'fiche', id: e.id })}>Voir</button>
              {admin && <><button className="sec" onClick={() => aller({ v: 'form', id: e.id })}>Modifier</button>
                <button className="danger" onClick={() => supprimer(e)}>Supprimer</button></>}</td></tr>)}</tbody></table></div>}
      {d && <div className="pagination"><button className="sec" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button>
        <span>Page {d.page} / {d.pages} — {d.total} élève(s)</span>
        <button className="sec" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Suivant</button></div>}
    </>
  );
}

function Formulaire({ id, retour }) {
  const [f, setF] = useState({ prenom: '', nom: '', date_naissance: '', adresse: '', infos_medicales: '', annee_entree: '' });
  const [annees, setAnnees] = useState([]); const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/referentiels').then((r) => setAnnees(r.annees)).catch((x) => setErr(x.message));
    if (id) api(`/api/eleves/${id}`).then((e) => setF((o) => Object.fromEntries(Object.keys(o).map((k) => [k, e[k] ?? ''])))).catch((x) => setErr(x.message));
  }, [id]);
  const maj = (e) => setF({ ...f, [e.target.name]: e.target.value });
  async function envoyer(e) {
    e.preventDefault(); setErr('');
    try { await api(id ? `/api/eleves/${id}` : '/api/eleves', { method: id ? 'PUT' : 'POST', body: nulls(f) }); retour(); }
    catch (x) { setErr(x.message); }
  }
  return (
    <>
      <h1>{id ? 'Modifier l’élève' : 'Nouvel élève'}</h1>
      <form className="carte form" style={{ maxWidth: 520 }} onSubmit={envoyer}>
        <Champ label="Prénom *" name="prenom" required maxLength={100} value={f.prenom} onChange={maj} />
        <Champ label="Nom *" name="nom" required maxLength={100} value={f.nom} onChange={maj} />
        <Champ label="Date de naissance *" name="date_naissance" type="date" required max={new Date().toISOString().slice(0, 10)} value={f.date_naissance} onChange={maj} />
        <Champ label="Adresse" name="adresse" maxLength={300} value={f.adresse} onChange={maj} />
        <label htmlFor="annee_entree">Année d’entrée</label>
        <select id="annee_entree" name="annee_entree" value={f.annee_entree} onChange={maj}><option value="">—</option>{annees.map((a) => <option key={a.code}>{a.code}</option>)}</select>
        <label htmlFor="infos_medicales">Informations médicales (visibles par la direction uniquement)</label>
        <textarea id="infos_medicales" name="infos_medicales" rows="3" maxLength={2000} value={f.infos_medicales} onChange={maj} />
        <Message type="err">{err}</Message>
        <button type="submit">Enregistrer</button> <button type="button" className="sec" onClick={retour}>Annuler</button>
      </form>
    </>
  );
}

function Fiche({ id, admin, aller, retour }) {
  const [e, setE] = useState(null); const [classes, setClasses] = useState([]); const [choix, setChoix] = useState('');
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const charger = useCallback(async () => {
    try {
      setE(await api(`/api/eleves/${id}`));
      if (admin) { const { annees } = await api('/api/referentiels'); const act = annees.find((a) => a.active); setClasses(act ? await api(`/api/classes?annee=${act.code}`) : []); }
    } catch (x) { setErr(x.message); }
  }, [id, admin]);
  useEffect(() => { charger(); }, [charger]);
  async function affecter() {
    setErr(''); setOk('');
    try { await api(`/api/eleves/${id}/classe`, { method: 'PUT', body: { classe_id: Number(choix) } }); setOk('Élève affecté à la classe.'); charger(); } catch (x) { setErr(x.message); }
  }
  async function retirer(a) {
    if (!window.confirm(`Retirer l’élève de la classe ${a.niveau} ${a.section} (${a.annee_scolaire}) ?`)) return;
    try { await api(`/api/eleves/${id}/classe/${a.annee_scolaire}`, { method: 'DELETE' }); setOk('Affectation retirée.'); charger(); } catch (x) { setErr(x.message); }
  }
  return (
    <>
      <button className="sec" onClick={retour}>← Retour à la liste</button>
      <Message type="err">{err}</Message><Message type="ok">{ok}</Message>
      {e && <>
        <h1>{e.prenom} {e.nom}</h1>
        <div className="carte"><dl>
          <dt>Date de naissance</dt><dd>{fmtDate(e.date_naissance)}</dd>
          {'adresse' in e && <><dt>Adresse</dt><dd>{e.adresse || '—'}</dd><dt>Année d’entrée</dt><dd>{e.annee_entree || '—'}</dd></>}
          {'infos_medicales' in e && <><dt>Informations médicales</dt><dd>{e.infos_medicales || '—'}</dd></>}
        </dl>{admin && <button onClick={() => aller({ v: 'form', id })}>Modifier</button>}</div>
        <div className="carte" style={{ marginTop: '1rem' }}><h2>Classes</h2>
          {e.affectations.length === 0 ? <p>Aucune classe affectée.</p> : <ul>{e.affectations.map((a) => <li key={a.annee_scolaire}>
            {a.annee_scolaire} : {a.niveau} {a.section} {admin && <button className="lien" onClick={() => retirer(a)}>Retirer</button>}</li>)}</ul>}
          {admin && (classes.length === 0 ? <p className="aide">Aucune classe pour l’année active. Créez une année active et des classes dans le module Classes.</p> : <>
            <label htmlFor="classe">Affecter à une classe (année active)</label>
            <select id="classe" value={choix} onChange={(x) => setChoix(x.target.value)}><option value="">Choisir…</option>
              {classes.map((c) => <option key={c.id} value={c.id} disabled={c.effectif >= c.capacite}>{c.niveau} {c.section} — {c.effectif}/{c.capacite}{c.effectif >= c.capacite ? ' (complète)' : ''}</option>)}</select>
            <p><button disabled={!choix} onClick={affecter}>Affecter</button></p></>)}
        </div></>}
    </>
  );
}

export default function Eleves({ user }) {
  const [vue, setVue] = useState({ v: 'liste' });
  const retour = () => setVue({ v: 'liste' }); const admin = user.role === 'admin';
  if (vue.v === 'form' && admin) return <Formulaire id={vue.id} retour={retour} />;
  if (vue.v === 'fiche') return <Fiche id={vue.id} admin={admin} aller={setVue} retour={retour} />;
  return <Liste admin={admin} aller={setVue} />;
}
