import { Plus, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../application/workspace-controller";
import { DraftStorageNotice } from "./StorageNotice";

export function QuickCreate() {
  const { endQuickCreateSession, globalDraft, submitGlobalTask, updateGlobalDraft } =
    useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const restoredGenerationRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (
      globalDraft &&
      inputRef.current &&
      restoredGenerationRef.current !== globalDraft.generation
    ) {
      inputRef.current.setSelectionRange(
        globalDraft.cursorOffset,
        globalDraft.cursorOffset,
      );
      restoredGenerationRef.current = globalDraft.generation;
    }
  }, [globalDraft]);

  function submit(): void {
    if (!submitGlobalTask()) return;
    if (inputRef.current) inputRef.current.value = "";
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.currentTarget.blur();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (composingRef.current || event.nativeEvent.isComposing) return;
    submit();
  }

  function openMobile(): void {
    setMobileOpen(true);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const offset = globalDraft?.cursorOffset ?? input.value.length;
      input.setSelectionRange(offset, offset);
    });
  }

  function closeMobile(): void {
    setMobileOpen(false);
    endQuickCreateSession();
    inputRef.current?.blur();
  }

  const value = globalDraft?.title ?? "";
  return (
    <>
      <div className={`quick-create-shell ${mobileOpen ? "is-mobile-open" : ""}`}>
        <form className="quick-create" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            aria-label="快速添加任务"
            autoComplete="off"
            enterKeyHint="done"
            maxLength={1000}
            placeholder="添加一项任务"
            value={value}
            onChange={(event) =>
              updateGlobalDraft(
                event.currentTarget.value,
                event.currentTarget.selectionStart ?? event.currentTarget.value.length,
              )
            }
            onSelect={(event) => {
              if (event.currentTarget.value === "") return;
              updateGlobalDraft(
                event.currentTarget.value,
                event.currentTarget.selectionStart ?? event.currentTarget.value.length,
              );
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={onKeyDown}
          />
          {value !== "" ? (
            <button
              className="icon-button subtle-button"
              type="button"
              aria-label="清空草稿"
              title="清空草稿"
              onClick={() => {
                updateGlobalDraft("", 0);
                inputRef.current?.focus();
              }}
            >
              <X size={17} aria-hidden="true" />
            </button>
          ) : null}
          <button
            className="icon-button add-button"
            type="submit"
            aria-label="添加任务"
            title="添加任务"
            disabled={value.trim().length === 0}
          >
            <Plus size={19} aria-hidden="true" />
          </button>
        </form>
        <DraftStorageNotice />
      </div>

      <button
        className={`mobile-create-trigger ${mobileOpen ? "is-open" : ""}`}
        type="button"
        aria-label={mobileOpen ? "关闭快速添加" : "打开快速添加"}
        title={mobileOpen ? "关闭快速添加" : "打开快速添加"}
        onClick={mobileOpen ? closeMobile : openMobile}
      >
        {mobileOpen ? (
          <X size={24} aria-hidden="true" />
        ) : (
          <Plus size={26} aria-hidden="true" />
        )}
      </button>
    </>
  );
}
