// Appels vers le backend (même origine : le cookie de session est géré par le navigateur)
export async function api(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Serveur injoignable. Vérifiez que le backend est démarré.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.erreur || 'Une erreur est survenue.'), { status: res.status });
  return data;
}
