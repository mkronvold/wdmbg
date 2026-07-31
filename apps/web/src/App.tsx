import { useQuery } from '@tanstack/react-query';
import type { Health } from '@wdmbg/contracts';
import { healthSchema } from '@wdmbg/contracts';

async function fetchHealth(): Promise<Health> {
  const response = await fetch('/health');
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return healthSchema.parse(await response.json());
}

export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Passive traffic monitor</p>
        <h1>WDMBG</h1>
        <p className="subtitle">Where did my bandwidth go?</p>
      </header>
      <main className="panel">
        <h2>API status</h2>
        {health.isLoading && <p>Checking API…</p>}
        {health.isError && (
          <p className="muted">
            API unreachable from this shell (start <code>apps/api</code> or use the proxy).
          </p>
        )}
        {health.data && (
          <dl className="status">
            <div>
              <dt>Status</dt>
              <dd>{health.data.status}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{health.data.service}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{health.data.version}</dd>
            </div>
          </dl>
        )}
      </main>
    </div>
  );
}
