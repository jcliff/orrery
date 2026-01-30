import type { VisualizationRegistry } from '../visualizations/types';

interface HeaderProps {
  currentView: string;
  onNavigate: (viewId: string) => void;
  visualizations: VisualizationRegistry;
}

export function Header({ currentView, onNavigate, visualizations }: HeaderProps) {
  return (
    <header style={styles.header}>
      <div style={styles.brand}>
        <span style={styles.brandName}>Chrona</span>
        <span style={styles.brandTagline}>Timelapse Visualizations</span>
      </div>
      <select
        style={styles.select}
        value={currentView}
        onChange={(e) => onNavigate(e.target.value)}
      >
        {Object.values(visualizations).map((viz) => (
          <option key={viz.id} value={viz.id}>
            {viz.name}
          </option>
        ))}
      </select>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: '#1a1a1a',
    borderBottom: '1px solid #333',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    flexShrink: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
  },
  brandName: {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.02em',
  },
  brandTagline: {
    fontSize: 12,
    opacity: 0.6,
  },
  select: {
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 6,
    color: 'white',
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer',
    minWidth: 180,
  },
};
