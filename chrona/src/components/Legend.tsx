import type { VisualizationConfig } from '../visualizations/types';

interface LegendProps {
  config: VisualizationConfig;
}

export function Legend({ config }: LegendProps) {
  const { legend } = config;

  return (
    <div style={styles.legend}>
      <div style={styles.title}>{legend.title}</div>
      {legend.items.map(({ label, color, shape = 'circle' }) => (
        <div key={label} style={styles.item}>
          <div style={getShapeStyle(color, shape)} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function getShapeStyle(color: string, shape: 'line' | 'circle' | 'square'): React.CSSProperties {
  const base: React.CSSProperties = {
    background: color,
  };

  switch (shape) {
    case 'line':
      return { ...base, width: 20, height: 3, borderRadius: 2 };
    case 'circle':
      return { ...base, width: 10, height: 10, borderRadius: '50%' };
    case 'square':
      return { ...base, width: 10, height: 10, borderRadius: 2 };
    default:
      return { ...base, width: 10, height: 10, borderRadius: '50%' };
  }
}

const styles: Record<string, React.CSSProperties> = {
  legend: {
    position: 'absolute',
    top: 100,
    left: 16,
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '12px 16px',
    borderRadius: 8,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 11,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
};
