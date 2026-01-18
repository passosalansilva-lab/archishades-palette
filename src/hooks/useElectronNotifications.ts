import { useCallback } from 'react';

// Define the Electron API interface for notifications
interface ElectronNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  urgency?: 'normal' | 'critical' | 'low';
  tag?: string;
  onClick?: () => void;
}

interface ElectronAPI {
  minimize?: () => void;
  maximize?: () => void;
  showNotification?: (options: ElectronNotificationOptions) => void;
  onNotificationClick?: (callback: (tag: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * Check if we're running in Electron environment
 */
export function isElectron(): boolean {
  return typeof navigator !== 'undefined' && 
    (navigator.userAgent.toLowerCase().includes('electron') || 
     !!(window as any).process?.versions?.electron ||
     !!window.electronAPI);
}

/**
 * Hook for showing notifications - uses Electron native notifications when available,
 * falls back to Web Notification API
 */
export function useElectronNotifications() {
  const isElectronApp = isElectron();

  const showNotification = useCallback((options: {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    onClick?: () => void;
    silent?: boolean;
    urgency?: 'normal' | 'critical' | 'low';
  }) => {
    const { title, body, icon = '/pwa-192x192.png', tag, onClick, silent = false, urgency = 'normal' } = options;

    // If in Electron, try to use native notifications
    if (isElectronApp && window.electronAPI?.showNotification) {
      console.log('[ElectronNotifications] Sending native notification:', title);
      
      window.electronAPI.showNotification({
        title,
        body,
        icon,
        silent,
        urgency,
        tag,
      });

      // Register click handler if provided
      if (onClick && window.electronAPI.onNotificationClick) {
        window.electronAPI.onNotificationClick((clickedTag) => {
          if (clickedTag === tag) {
            onClick();
          }
        });
      }

      return true;
    }

    // Fallback to Web Notification API
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        console.log('[ElectronNotifications] Sending web notification:', title);
        
        const notification = new Notification(title, {
          body,
          icon,
          tag,
          silent,
        });

        if (onClick) {
          notification.onclick = () => {
            window.focus();
            onClick();
            notification.close();
          };
        }

        return true;
      } else if (Notification.permission !== 'denied') {
        // Request permission
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            showNotification(options);
          }
        });
      }
    }

    console.log('[ElectronNotifications] Notifications not available');
    return false;
  }, [isElectronApp]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    // Electron notifications don't need permission
    if (isElectronApp) {
      return true;
    }

    // Web notifications need permission
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }, [isElectronApp]);

  const isSupported = isElectronApp || ('Notification' in window);

  return {
    showNotification,
    requestPermission,
    isElectronApp,
    isSupported,
  };
}

/**
 * Show a notification (can be called outside of React components)
 */
export function showSystemNotification(options: {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
  silent?: boolean;
}): boolean {
  const { title, body, icon = '/pwa-192x192.png', tag, onClick, silent = false } = options;
  const isElectronApp = isElectron();

  // If in Electron, try to use native notifications
  if (isElectronApp && window.electronAPI?.showNotification) {
    console.log('[SystemNotification] Sending Electron notification:', title);
    
    window.electronAPI.showNotification({
      title,
      body,
      icon,
      silent,
      tag,
    });

    return true;
  }

  // Fallback to Web Notification API
  if ('Notification' in window && Notification.permission === 'granted') {
    console.log('[SystemNotification] Sending web notification:', title);
    
    const notification = new Notification(title, {
      body,
      icon,
      tag,
      silent,
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    return true;
  }

  return false;
}
