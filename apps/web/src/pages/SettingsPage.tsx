import { useState } from 'react';
import { api, apiConfig } from '../api';
import { useLoad } from '../components/util';

interface Providers {
  pipeline: { reachable: boolean; provider: string; url: string };
  storage: { driver: string };
  notifications: { channels: string[] };
  publishing: { implemented: string[]; slots: string[] };
}

export function SettingsPage() {
  const config = apiConfig();
  const [apiUrl, setApiUrl] = useState(config.baseUrl);
  const [token, setToken] = useState(config.token);
  const [saved, setSaved] = useState(false);
  const providers = useLoad(() => api.get<Providers>('/settings/providers'));

  const save = () => {
    localStorage.setItem('hype.apiUrl', apiUrl);
    localStorage.setItem('hype.apiToken', token);
    setSaved(true);
    providers.reload();
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <div className="card stack" style={{ maxWidth: 520 }}>
        <label className="field">
          API base URL (default: /api → vite proxy → :3001)
          <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
        </label>
        <label className="field">
          API token
          <input value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <div className="row">
          <button onClick={save}>Save</button>
          {saved && <span className="okbox" style={{ margin: 0 }}>Saved</span>}
        </div>
      </div>

      <h2>Providers</h2>
      {providers.error && <div className="errbox">{providers.error}</div>}
      {providers.data && (
        <div className="card small stack">
          <div>
            Pipeline:{' '}
            {providers.data.pipeline.reachable ? (
              <span className="badge low">
                reachable · {providers.data.pipeline.provider} · {providers.data.pipeline.url}
              </span>
            ) : (
              <span className="badge high">unreachable — start with `pnpm dev:pipeline`</span>
            )}
          </div>
          <div>Storage: {providers.data.storage.driver}</div>
          <div>Notifications: {providers.data.notifications.channels.join(', ')}</div>
          <div>
            Publishing adapters: {providers.data.publishing.implemented.join(', ')} implemented;{' '}
            {providers.data.publishing.slots.join(', ')} slots (fall back to manual export)
          </div>
        </div>
      )}
    </>
  );
}
