import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, useI18n } from "../../src/application/i18n";

function Probe() {
  const { errorText, language, setLanguage, text } = useI18n();
  return (
    <div>
      <output>{`${language}:${text("中文", "English")}`}</output>
      <span>{errorText(new Error("分类名称已存在"), "失败", "Failed")}</span>
      <button type="button" onClick={() => setLanguage("en")}>
        English
      </button>
      <button type="button" onClick={() => setLanguage("zh-CN")}>
        简体中文
      </button>
    </div>
  );
}

function setLanguages(languages: string[]): void {
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    value: languages,
  });
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the first supported browser language and falls back to Chinese", () => {
    setLanguages(["fr-FR", "en-GB", "zh-CN"]);
    const first = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("en:English")).toBeVisible();
    first.unmount();

    setLanguages(["fr-FR"]);
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("zh-CN:中文")).toBeVisible();
  });

  it("prefers the saved language and switches without reloading", async () => {
    localStorage.setItem("desktop-pull-language-v1", "en");
    setLanguages(["zh-CN"]);
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("en:English")).toBeVisible();
    expect(screen.getByText("A category with this name already exists")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "简体中文" }));
    expect(screen.getByText("zh-CN:中文")).toBeVisible();
    expect(screen.getByText("分类名称已存在")).toBeVisible();
    expect(localStorage.getItem("desktop-pull-language-v1")).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
