import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { t } from '../i18n.js';

// On a phone the views are a floating tab bar at the bottom, like iOS: frosted glass, the open view in a lighter pill
// that slides from tab to tab.
export default function TabBar() {
  const { mode, openMode, filters, setFilters, update } = useApp();
  const saved = mode === 'feed' && !!filters.saved;
  const tabs = [
    { id: 'feed', icon: 'home', label: t('Feed'), on: mode === 'feed' && !saved, go: () => { if (filters.saved || mode === 'feed') setFilters({}); else openMode('feed'); } },
    { id: 'saved', icon: 'save', label: t('Saved'), on: saved, go: () => { openMode('feed'); setFilters({ saved: true }); } },
    { id: 'map', icon: 'map', label: t('Your map'), on: mode === 'map', go: () => openMode('map') },
    { id: 'memory', icon: 'brain', label: t('Memory'), on: mode === 'memory', go: () => openMode('memory') },
    { id: 'settings', icon: 'gear', label: t('Settings'), on: mode === 'settings', go: () => openMode('settings'), dot: !!update?.available }
  ];
  const at = tabs.findIndex((x) => x.on);
  return (
    <nav className="tabbar" aria-label={t('Views')}>
      <div className="tabbar-in" style={{ '--i': Math.max(0, at), '--n': tabs.length }}>
        <i className={`tabpill${at < 0 ? ' none' : ''}`} aria-hidden="true" />
        {tabs.map((x) => (
          <button key={x.id} type="button" className={`tab${x.on ? ' on' : ''}`} onClick={() => { x.go(); try { navigator.vibrate?.(5); } catch {} }} aria-current={x.on ? 'page' : undefined}>
            <span className="tab-ic"><Icon name={x.icon} filled={x.on && x.id === 'saved'} />{x.dot ? <i className="tab-dot" /> : null}</span>
            <span className="tab-l">{x.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
