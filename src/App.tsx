import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppDatabase, initializeStorage, requestPersistence } from './storage';
import { CheckIns } from './CheckIns';
import { useRecords } from './useReadings';
import { Settings } from './Settings';
import { Mirror } from './MirrorScreen';
import { Becoming } from './BecomingScreen';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const database = new AppDatabase();
const storageReady = initializeStorage(database);
const build = __BUILD_INFO__;

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function TodayIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>;
}

function AboutIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></svg>;
}

export function App() {
  const routeFromHash = () => window.location.hash === '#/about' ? 'about' : window.location.hash === '#/becoming' ? 'becoming' : window.location.hash === '#/mirror' ? 'mirror' : window.location.hash === '#/readings' ? 'readings' : window.location.hash === '#/settings' ? 'settings' : 'today';
  const [route, setRoute] = useState(routeFromHash);
  const data = useRecords(database);
  const [editing, setEditing] = useState(false);
  const [storage, setStorage] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [online, setOnline] = useState(navigator.onLine);
  const [cacheReady, setCacheReady] = useState(Boolean(navigator.serviceWorker?.controller));
  const [swError, setSwError] = useState(false);
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [persistenceRequested, setPersistenceRequested] = useState(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const { offlineReady: [offlineReady], needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) { if (registration?.active) setCacheReady(true); },
    onRegisterError() { setSwError(true); },
  });
  const readyOffline = offlineReady || cacheReady;

  useEffect(() => {
    let alive = true;
    storageReady.then((result) => { if (alive) setStorage(result); });
    navigator.storage?.persisted?.().then((result) => { if (alive) setPersisted(result); }).catch(() => {});
    const onHash = () => {
      setRoute(routeFromHash());
      window.scrollTo(0, 0);
    };
    const onNetwork = () => setOnline(navigator.onLine);
    const onInstallPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); setInstallHelp(false); };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      alive = false;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (route !== 'about') return;
    let alive = true;
    async function readEvidence() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}artifact-manifest.json`, { cache: 'no-store' });
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        const evidence = JSON.parse(new TextDecoder().decode(bytes)) as { build: { commit: string } };
        if (evidence.build.commit !== build.commit) return;
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
        if (alive) setFingerprint(hex);
      } catch { /* Evidence is optional offline; the compiled source version remains visible. */ }
    }
    void readEvidence();
    return () => { alive = false; };
  }, [route]);

  async function install() {
    if (!installEvent) { setInstallHelp((shown) => !shown); return; }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === 'dismissed') setInstallHelp(true);
  }

  async function protectStorage() {
    setPersisted(await requestPersistence(navigator.storage));
    setPersistenceRequested(true);
  }

  const offlineLabel = readyOffline ? 'Ready offline' : swError ? 'Offline access unavailable' : 'Preparing offline access';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <header className="app-header">
        <a className="wordmark" href="#/" aria-label="Tyree Life Compass, Today">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} width="40" height="40" alt="" />
          <span><span className="wordmark-name">TYREE</span><span className="wordmark-title">Life Compass</span></span>
        </a>
        <span className="connection"><span className={online ? 'connection-dot' : 'connection-dot is-offline'} />{online ? 'On this device' : 'You’re offline'}</span>
      </header>

      <main id="main" tabIndex={-1}>
        {route === 'becoming' ? <Becoming database={database} onEditingChange={setEditing} /> : route === 'mirror' ? <Mirror {...data} /> : route === 'settings' ? <Settings database={database} /> : route !== 'about' ? (
          <>
            <CheckIns database={database} {...data} journal={route === 'readings'} onEditingChange={setEditing} />
            {!editing && route === 'today' && data.records.length === 0 && <section className="install-card" aria-labelledby="install-title">
              <div className="section-marker" aria-hidden="true">↗</div>
              <div className="install-content">
                <h2 id="install-title">{installed ? 'A place on your home screen' : 'Keep it on your home screen'}</h2>
                <p>{installed ? 'Open Life Compass here whenever you need it.' : 'Open your app with a tap, even without a connection once offline access is ready.'}</p>
                {!installed && <button className="primary-button" onClick={() => void install()} aria-expanded={installHelp}>Install app <Arrow /></button>}
                {installHelp && <div className="install-help" role="status">
                  <p>On Android, open this link in Chrome. Tap the three-dot menu, then <strong>Add to home screen</strong> or <strong>Install app</strong>.</p>
                  <p>If you opened this inside another app, open the link in Chrome first.</p>
                </div>}
              </div>
            </section>}
            {!editing && <p className="quiet-note">Your records stay in this browser. No account or cloud sync.</p>}
          </>
        ) : (
          <>
            <div className="page-heading"><p className="eyebrow">Your app, on your device</p><h1>About this app</h1></div>
            <section className="detail-section" aria-labelledby="storage-title">
              <h2 id="storage-title">Kept close</h2>
              <dl className="status-list">
                <div><dt>Local storage</dt><dd aria-live="polite">{storage === 'ready' ? 'Ready on this device' : storage === 'checking' ? 'Checking storage' : 'Unavailable in this browser'}</dd></div>
                <div><dt>Offline access</dt><dd>{offlineLabel}</dd></div>
                <div><dt>Storage protection</dt><dd>{persisted ? 'Persistent storage granted' : 'Browser-managed'}</dd></div>
              </dl>
              <p className="secondary">Your app does not send personal records anywhere. Clearing this browser’s site data can erase them. Keep exports once you begin recording.</p>
              {!persisted && storage === 'ready' && <button className="text-button" onClick={() => void protectStorage()}>Request persistent storage <Arrow /></button>}
              {persistenceRequested && !persisted && <p className="secondary" role="status">The browser is still managing storage. You can keep using the app; persistence cannot be guaranteed.</p>}
              {storage === 'unavailable' && <p role="alert">This browser cannot save records. Try a regular Chrome window with site storage enabled.</p>}
            </section>
            <section className="detail-section" aria-labelledby="release-title">
              <h2 id="release-title">This release</h2>
              <p className="secondary">The public build checks test the compiled app before publishing it. They also compare the live files with the tested artifact.</p>
              <dl className="status-list release-details">
                <div><dt>Source version</dt><dd><code>{build.commit === 'local-development' ? 'Local preview' : build.commit.slice(0, 12)}</code></dd></div>
                <div><dt>Built</dt><dd><time dateTime={build.builtAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(build.builtAt))}</time></dd></div>
              </dl>
              {build.runUrl && <a className="text-button" href={build.runUrl} target="_blank" rel="noopener noreferrer">View build checks <Arrow /></a>}
              {fingerprint && <details className="fingerprint"><summary>Deployment fingerprint</summary><p>SHA-256 of the file manifest, also recorded in the build checks.</p><code>{fingerprint}</code></details>}
              {!build.runUrl && <p className="secondary">Local preview. Deployment evidence appears in the published release.</p>}
            </section>
            <section className="detail-section" aria-labelledby="reminders-title">
              <h2 id="reminders-title">A note on reminders</h2>
              <p className="secondary">A closed web app cannot reliably schedule local reminders. Recurring Android alarms will handle them; changing app settings will not change your alarms.</p>
            </section>
          </>
        )}
        {needRefresh && <aside className="update-notice" role="status"><p>A new version is ready.{editing ? ' Save or close your edit before updating.' : ''}</p><button className="text-button" disabled={editing} onClick={() => void updateServiceWorker(true)}>Update app <Arrow /></button></aside>}
      </main>

      <footer className="app-footer"><span className="offline-status" role="status"><span className={readyOffline ? 'status-dot ready' : 'status-dot'} />{offlineLabel}</span><span>Life Compass</span></footer>
      <nav className="bottom-nav" aria-label="Main navigation">
        <a href="#/" aria-current={route === 'today' ? 'page' : undefined}><TodayIcon /><span>Today</span></a>
        <a href="#/mirror" aria-current={route === 'mirror' ? 'page' : undefined}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M3 4v16h18M6 14l4-5 4 3 6-7" /></svg><span>Mirror</span></a>
        <a href="#/becoming" aria-current={route === 'becoming' ? 'page' : undefined}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 20V9m7 11V4m7 16v-7M9 7l3-3 3 3" /></svg><span>Becoming</span></a>
        <a href="#/readings" aria-current={route === 'readings' ? 'page' : undefined}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 4h14v16H5zM9 8h6m-6 4h6m-6 4h4" /></svg><span>Readings</span></a>
        <a href="#/settings" aria-current={route === 'settings' ? 'page' : undefined}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></svg><span>Settings</span></a>
        <a href="#/about" aria-current={route === 'about' ? 'page' : undefined}><AboutIcon /><span>About</span></a>
      </nav>
    </div>
  );
}
