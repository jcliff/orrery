import { describe, it, expect } from 'vitest';
import {
  getUseColor,
  getUseLabel,
  getLabelColor,
  USE_COLORS,
  USE_LABELS,
  LABEL_COLORS,
} from '../nevada-land-use';

describe('nevada-land-use', () => {
  describe('getUseColor', () => {
    it('returns correct color for known codes', () => {
      expect(getUseColor('200')).toBe('#3498db'); // Single Family
      expect(getUseColor('300')).toBe('#e74c3c'); // Commercial
      expect(getUseColor('400')).toBe('#7f8c8d'); // Industrial
      expect(getUseColor('600')).toBe('#27ae60'); // Agricultural
    });

    it('handles comma-separated codes (uses first)', () => {
      expect(getUseColor('200, 600')).toBe('#3498db');
      expect(getUseColor('300,400')).toBe('#e74c3c');
    });

    it('falls back to prefix color for unknown codes', () => {
      expect(getUseColor('299')).toBe('#3498db'); // 2xx = Residential
      expect(getUseColor('399')).toBe('#e74c3c'); // 3xx = Commercial
      expect(getUseColor('777')).toBe('#95a5a6'); // 7xx = Mining
    });

    it('returns default color for null/empty', () => {
      expect(getUseColor(null)).toBe('#95a5a6');
      expect(getUseColor('')).toBe('#95a5a6');
    });

    it('returns default color for invalid prefix', () => {
      expect(getUseColor('999')).toBe('#95a5a6');
      expect(getUseColor('abc')).toBe('#95a5a6');
    });
  });

  describe('getUseLabel', () => {
    it('returns correct label for known codes', () => {
      expect(getUseLabel('200')).toBe('Single Family');
      expect(getUseLabel('210')).toBe('Multi-Family');
      expect(getUseLabel('330')).toBe('Hotel');
      expect(getUseLabel('340')).toBe('Casino');
    });

    it('handles comma-separated codes (uses first)', () => {
      expect(getUseLabel('200, 600')).toBe('Single Family');
      expect(getUseLabel('330,200')).toBe('Hotel');
    });

    it('falls back to category label for unknown codes', () => {
      expect(getUseLabel('299')).toBe('Residential');
      expect(getUseLabel('399')).toBe('Commercial');
      expect(getUseLabel('599')).toBe('Industrial');
    });

    it('returns Unknown for null/empty', () => {
      expect(getUseLabel(null)).toBe('Unknown');
      expect(getUseLabel('')).toBe('Unknown');
    });
  });

  describe('getLabelColor', () => {
    it('returns correct color for known labels', () => {
      expect(getLabelColor('Single Family')).toBe('#3498db');
      expect(getLabelColor('Commercial')).toBe('#e74c3c');
      expect(getLabelColor('Casino')).toBe('#d63031');
    });

    it('returns default color for unknown labels', () => {
      expect(getLabelColor('Unknown')).toBe('#95a5a6');
      expect(getLabelColor('Something Else')).toBe('#95a5a6');
    });
  });

  describe('constants', () => {
    it('USE_COLORS has all major categories', () => {
      expect(USE_COLORS['100']).toBeDefined(); // Vacant
      expect(USE_COLORS['200']).toBeDefined(); // Residential
      expect(USE_COLORS['300']).toBeDefined(); // Commercial
      expect(USE_COLORS['400']).toBeDefined(); // Industrial
      expect(USE_COLORS['600']).toBeDefined(); // Agricultural
      expect(USE_COLORS['800']).toBeDefined(); // Government
    });

    it('USE_LABELS matches USE_COLORS keys', () => {
      for (const code of Object.keys(USE_COLORS)) {
        expect(USE_LABELS[code]).toBeDefined();
      }
    });

    it('LABEL_COLORS covers common use types', () => {
      const commonLabels = ['Single Family', 'Multi-Family', 'Commercial', 'Industrial', 'Vacant'];
      for (const label of commonLabels) {
        expect(LABEL_COLORS[label]).toBeDefined();
      }
    });
  });
});
