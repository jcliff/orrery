import { useState, useEffect } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Header } from './components/Header';
import { VisualizationView } from './components/VisualizationView';
import { visualizations } from './visualizations/registry';

function getHashRoute(): string {
  const hash = window.location.hash.slice(2); // Remove '#/'
  return hash || 'hurricanes';
}

export function App() {
  const [currentView, setCurrentView] = useState(getHashRoute);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentView(getHashRoute());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (viewId: string) => {
    window.location.hash = `#/${viewId}`;
  };

  const config = visualizations[currentView];

  if (!config) {
    return (
      <div style={{ padding: 20, color: 'white', background: '#1a1a1a', height: '100%' }}>
        <p>Unknown visualization: {currentView}</p>
        <p>Available: {Object.keys(visualizations).join(', ')}</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Header
        currentView={currentView}
        onNavigate={handleNavigate}
        visualizations={visualizations}
      />
      <div style={{ position: 'absolute', top: 41, left: 0, right: 0, bottom: 0 }}>
        <VisualizationView key={currentView} config={config} />
      </div>
    </div>
  );
}
