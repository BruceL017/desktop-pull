import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Language = "zh-CN" | "en";

interface I18nValue {
  language: Language;
  locale: string;
  setLanguage(language: Language): void;
  text(chinese: string, english: string): string;
  errorText(error: unknown, chineseFallback: string, englishFallback: string): string;
}

const languageStorageKey = "desktop-pull-language-v1";
const defaultValue: I18nValue = {
  language: "zh-CN",
  locale: "zh-CN",
  setLanguage: () => undefined,
  text: (chinese) => chinese,
  errorText: (error, chineseFallback) =>
    error instanceof Error ? error.message : chineseFallback,
};
const I18nContext = createContext<I18nValue>(defaultValue);

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(languageStorageKey);
    if (saved === "zh-CN" || saved === "en") return saved;
  } catch {
    // Continue with browser language detection when preferences are unavailable.
  }
  try {
    for (const language of navigator.languages) {
      const normalized = language.toLocaleLowerCase();
      if (normalized.startsWith("zh")) return "zh-CN";
      if (normalized.startsWith("en")) return "en";
    }
  } catch {
    // Chinese is the product default when browser preferences cannot be read.
  }
  return "zh-CN";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(languageStorageKey, next);
    } catch {
      // The current session still switches even when preferences cannot persist.
    }
  }, []);

  const text = useCallback(
    (chinese: string, english: string) => (language === "zh-CN" ? chinese : english),
    [language],
  );

  const errorText = useCallback(
    (error: unknown, chineseFallback: string, englishFallback: string) => {
      const raw = error instanceof Error ? error.message : "";
      if (language === "zh-CN") {
        return /[\u3400-\u9fff]/u.test(raw) ? raw : chineseFallback;
      }
      const translations: Record<string, string> = {
        分类名称不能使用系统保留名: "This category name is reserved",
        分类名称已存在: "A category with this name already exists",
        分类不存在: "This category no longer exists",
        活动任务不存在: "This task is no longer active",
        垃圾箱任务不存在: "This task is no longer in Trash",
        "存在尚未安全保存的变更，暂时不能导入":
          "Changes are not safely saved yet, so import is unavailable",
      };
      return translations[raw] ?? englishFallback;
    },
    [language],
  );

  const value = useMemo<I18nValue>(
    () => ({
      language,
      locale: language === "zh-CN" ? "zh-CN" : "en-US",
      setLanguage,
      text,
      errorText,
    }),
    [errorText, language, setLanguage, text],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
