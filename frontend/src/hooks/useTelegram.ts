import { useEffect, useState } from 'react';

// Declare Telegram types for window
declare global {
  interface Window {
    Telegram: {
      WebApp: any;
    };
  }
}

export function useTelegram() {
  const [webApp, setWebApp] = useState<any>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setWebApp(tg);
      
      // Adapt theme
      const isDark = tg.colorScheme === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
    }
  }, []);

  const onClose = () => {
    webApp?.close();
  };

  const onToggleButton = () => {
    if (webApp?.MainButton.isVisible) {
      webApp.MainButton.hide();
    } else {
      webApp?.MainButton.show();
    }
  };

  return {
    onClose,
    onToggleButton,
    webApp,
    user: webApp?.initDataUnsafe?.user,
    isTelegram: !!webApp,
  };
}