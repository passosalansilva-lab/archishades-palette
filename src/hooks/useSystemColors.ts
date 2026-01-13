import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SystemColors {
  primary: string;
  secondary: string;
  accent: string;
}

const DEFAULT_COLORS: SystemColors = {
  primary: "#ea580c",
  secondary: "#f5f5f4",
  accent: "#fef3c7",
};

// Convert hex to HSL for CSS variables
const hexToHsl = (hex: string): string => {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return "12 85% 52%";
  
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  const hDeg = Math.round(h * 360);
  const sPercent = Math.round(s * 100);
  const lPercent = Math.round(l * 100);
  return `${hDeg} ${sPercent}% ${lPercent}%`;
};

const applyColors = (colors: SystemColors) => {
  const root = document.documentElement;
  root.style.setProperty('--primary', hexToHsl(colors.primary));
  root.style.setProperty('--ring', hexToHsl(colors.primary));
  root.style.setProperty('--sidebar-primary', hexToHsl(colors.primary));
  root.style.setProperty('--sidebar-ring', hexToHsl(colors.primary));
};

export function useSystemColors() {
  const [colors, setColors] = useState<SystemColors>(DEFAULT_COLORS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadColors = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['system_color_primary', 'system_color_secondary', 'system_color_accent']);

        if (error) {
          console.error('Error loading system colors:', error);
          return;
        }

        const loadedColors = { ...DEFAULT_COLORS };
        
        data?.forEach(item => {
          if (item.key === 'system_color_primary' && item.value) {
            loadedColors.primary = item.value;
          } else if (item.key === 'system_color_secondary' && item.value) {
            loadedColors.secondary = item.value;
          } else if (item.key === 'system_color_accent' && item.value) {
            loadedColors.accent = item.value;
          }
        });

        setColors(loadedColors);
        applyColors(loadedColors);
      } catch (err) {
        console.error('Error loading system colors:', err);
      } finally {
        setLoading(false);
      }
    };

    loadColors();
  }, []);

  return { colors, loading };
}
