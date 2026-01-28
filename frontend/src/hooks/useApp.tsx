import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, Theme, translations } from '../lib/translations';

interface AppContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    theme: Theme;
    setTheme: (theme: Theme) => void;
    t: (key: keyof typeof translations['en']) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>(
        (localStorage.getItem('dm_language') as Language) || 'zh'
    );
    const [theme, setTheme] = useState<Theme>(
        (localStorage.getItem('dm_theme') as Theme) || 'dark'
    );

    useEffect(() => {
        localStorage.setItem('dm_language', language);
    }, [language]);

    useEffect(() => {
        localStorage.setItem('dm_theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const t = (key: keyof typeof translations['en']) => {
        return translations[language][key] || translations['en'][key] || key;
    };

    return (
        <AppContext.Provider value={{ language, setLanguage, theme, setTheme, t }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
