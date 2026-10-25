export function Champ({ label, ...p }) { return <><label htmlFor={p.name}>{label}</label><input id={p.name} {...p} /></>; }
export function Message({ type, children }) {
  return children ? <div className={`msg ${type}`} role={type === 'err' ? 'alert' : 'status'}>{children}</div> : null;
}
export const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR') : '—');
export const nulls = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]));
