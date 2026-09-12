// Thin fetch wrapper shared by every page. Centralizes credentials, JSON
// handling and error shape so pages just do: await api.get('/doctors')
const api = (() => {
  const BASE = '/api';

  async function request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = null; }
    }

    if (!res.ok) {
      const error = new Error((data && data.error) || `Request failed (${res.status})`);
      error.status = res.status;
      error.details = data && data.details;
      throw error;
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
  };
})();
