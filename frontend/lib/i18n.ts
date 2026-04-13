import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en, Dictionary } from '../locales/en';
import { cs } from '../locales/cs';
import { sk } from '../locales/sk';

export type SupportedLanguage = 'en' | 'cs' | 'sk';

const dictionaries: Record<SupportedLanguage, Dictionary> = {
    en,
    cs,
    sk,
};

interface LanguageState {
    language: SupportedLanguage;
    setLanguage: (lang: SupportedLanguage) => void;
}

export const useLanguageStore = create<LanguageState>()(
    persist(
        (set) => ({
            language: 'en',
            setLanguage: (lang) => set({ language: lang }),
        }),
        {
            name: 'language-storage',
        }
    )
);

/**
 * Custom translation hook.
 * It natively understands our recursive namespace structure, 
 * so you can use it like: t('header.projects')
 */
export function useTranslation() {
    const language = useLanguageStore((state) => state.language);
    const dict = dictionaries[language] || dictionaries.en;

    // A helper to traverse the dictionary object by string path (like "header.projects")
    const t = (path: string, params?: Record<string, string | number>): string => {
        const keys = path.split('.');
        let current: any = dict;

        for (const key of keys) {
            if (current[key] === undefined) {
                return path; // Fallback to key if not found
            }
            current = current[key];
        }

        let translation = current as string;

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                translation = translation.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
            });
        }

        return translation;
    };

    return { t, language, setLanguage: useLanguageStore.getState().setLanguage };
}
