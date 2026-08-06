import { Globe2 } from "lucide-react";
import { useI18n } from "../application/i18n";

export function SettingsPage() {
  const { language, setLanguage, text } = useI18n();
  return (
    <main className="content-page settings-page">
      <header className="mobile-brand">Desktop Pull</header>
      <div className="page-heading">
        <div>
          <span className="section-kicker">{text("应用", "Application")}</span>
          <h1>{text("设置", "Settings")}</h1>
        </div>
      </div>
      <section className="settings-row">
        <div>
          <Globe2 size={19} aria-hidden="true" />
          <span>{text("界面语言", "Interface language")}</span>
        </div>
        <fieldset
          className="segmented-control"
          aria-label={text("界面语言", "Interface language")}
        >
          <button
            className={language === "zh-CN" ? "is-selected" : ""}
            type="button"
            aria-pressed={language === "zh-CN"}
            onClick={() => setLanguage("zh-CN")}
          >
            简体中文
          </button>
          <button
            className={language === "en" ? "is-selected" : ""}
            type="button"
            aria-pressed={language === "en"}
            onClick={() => setLanguage("en")}
          >
            English
          </button>
        </fieldset>
      </section>
    </main>
  );
}
