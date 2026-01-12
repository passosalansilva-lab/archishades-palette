import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

interface ManifestConfig {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  theme_color?: string;
  background_color?: string;
}

export function useDynamicManifest(config?: Partial<ManifestConfig>) {
  const location = useLocation();

  const manifestData = useMemo(() => {
    // Default configuration
    const defaultConfig: ManifestConfig = {
      name: 'Cardpon - Cardápio Digital',
      short_name: 'Cardpon',
      description: 'Cardápio digital e gestão de pedidos',
      start_url: location.pathname + location.search,
      scope: '/',
      theme_color: '#10B981',
      background_color: '#0F172A',
    };

    // Merge with custom config
    const finalConfig = { ...defaultConfig, ...(config ?? {}) };

    // Build complete manifest
    return {
      name: finalConfig.name,
      short_name: finalConfig.short_name,
      description: finalConfig.description,
      theme_color: finalConfig.theme_color,
      background_color: finalConfig.background_color,
      display: 'standalone',
      orientation: 'portrait',
      start_url: finalConfig.start_url,
      scope: finalConfig.scope,
      icons: [
        {
          src: '/pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: '/pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };
  }, [
    location.pathname,
    location.search,
    config?.name,
    config?.short_name,
    config?.description,
    config?.start_url,
    config?.scope,
    config?.theme_color,
    config?.background_color,
  ]);

  useEffect(() => {
    // Create blob URL for manifest
    const manifestBlob = new Blob([JSON.stringify(manifestData)], {
      type: 'application/json',
    });
    const manifestURL = URL.createObjectURL(manifestBlob);

    // Update existing manifest link (avoid removing/recreating on every render)
    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = manifestURL;

    // Update theme color
    let themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.setAttribute('content', manifestData.theme_color || '#10B981');

    // Cleanup
    return () => {
      URL.revokeObjectURL(manifestURL);
    };
  }, [manifestData]);

  return manifestData;
}
