import type { VisualizationConfig } from '../visualizations/types';

interface TitleProps {
  config: VisualizationConfig;
  count: number;
}

export function Title({ config, count }: TitleProps) {
  const { title } = config;

  return (
    <div style={styles.title}>
      <h1 style={styles.heading}>{title.text}</h1>
      <p style={styles.count}>
        {count.toLocaleString()} {title.countLabel || 'items'} shown
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    position: 'absolute',
    top: 16,
    left: 16,
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '12px 16px',
    borderRadius: 8,
    fontFamily: 'system-ui, sans-serif',
  },
  heading: {
    margin: 0,
    fontSize: 18,
  },
  count: {
    margin: '8px 0 0',
    fontSize: 12,
    opacity: 0.8,
  },
};
