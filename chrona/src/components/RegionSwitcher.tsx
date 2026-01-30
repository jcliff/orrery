import { useState, useCallback } from 'react';
import type { Region } from '../visualizations/types';

interface RegionSwitcherProps {
  regions: Region[];
  loadedRegions: Set<string>;
  onRegionSelect: (region: Region) => void;
  onRegionLoad: (regionId: string) => Promise<void>;
}

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  top: '10px',
  right: '10px',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(26, 26, 26, 0.9)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '4px',
  color: 'white',
  cursor: 'pointer',
  fontSize: '13px',
  textAlign: 'left',
  transition: 'all 0.2s ease',
};

const buttonHoverStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'rgba(52, 152, 219, 0.8)',
  borderColor: 'rgba(52, 152, 219, 1)',
};

const loadedIndicatorStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  marginRight: '8px',
};

export function RegionSwitcher({
  regions,
  loadedRegions,
  onRegionSelect,
  onRegionLoad,
}: RegionSwitcherProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleClick = useCallback(
    async (region: Region) => {
      // If not loaded, load first
      if (!loadedRegions.has(region.id)) {
        setLoadingId(region.id);
        try {
          await onRegionLoad(region.id);
        } finally {
          setLoadingId(null);
        }
      }

      // Then navigate to region
      onRegionSelect(region);
    },
    [loadedRegions, onRegionLoad, onRegionSelect]
  );

  if (regions.length === 0) return null;

  return (
    <div style={containerStyle}>
      <div
        style={{
          padding: '4px 8px',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}
      >
        Regions
      </div>
      {regions.map((region) => {
        const isLoaded = loadedRegions.has(region.id);
        const isLoading = loadingId === region.id;
        const isHovered = hoveredId === region.id;

        return (
          <button
            key={region.id}
            style={isHovered ? buttonHoverStyle : buttonStyle}
            onMouseEnter={() => setHoveredId(region.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => handleClick(region)}
            disabled={isLoading}
          >
            <span
              style={{
                ...loadedIndicatorStyle,
                background: isLoading
                  ? '#f39c12'
                  : isLoaded
                  ? '#27ae60'
                  : 'rgba(255, 255, 255, 0.3)',
              }}
            />
            {region.name}
            {isLoading && ' ...'}
          </button>
        );
      })}
    </div>
  );
}
