import { Plus, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "../application/i18n";
import { useWorkspace } from "../application/workspace-controller";
import type { DraftEntry } from "../domain/schemas";
import { globalDraftEntry } from "../domain/workspace";
import { DraftStorageNotice } from "./StorageNotice";

interface QuickCreateProps {
  entry?: DraftEntry;
  label?: string;
  contextual?: boolean;
  autoFocus?: boolean;
}

export function QuickCreate({
  entry = globalDraftEntry,
  label,
  contextual = false,
  autoFocus = false,
}: QuickCreateProps) {
  const { text } = useI18n();
  const { draftFor, endQuickCreateSession, submitDraft, updateDraft } = useWorkspace();
  const draft = draftFor(entry);
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const restoredGenerationRef = useRef<string | undefined>(undefined);
  const endSessionRef = useRef(endQuickCreateSession);
  const entryRef = useRef(entry);
  endSessionRef.current = endQuickCreateSession;
  entryRef.current = entry;

  useEffect(() => {
    if (draft && inputRef.current && restoredGenerationRef.current !== draft.generation) {
      inputRef.current.setSelectionRange(draft.cursorOffset, draft.cursorOffset);
      restoredGenerationRef.current = draft.generation;
    }
  }, [draft]);

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => inputRef.current?.focus());
  }, [autoFocus]);

  useEffect(
    () => () => {
      endSessionRef.current(entryRef.current);
    },
    [],
  );

  function submit(): void {
    if (!submitDraft(entry)) return;
    if (inputRef.current) inputRef.current.value = "";
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      endQuickCreateSession(entry);
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
      const offset = draft?.cursorOffset ?? input.value.length;
      input.setSelectionRange(offset, offset);
    });
  }

  function closeMobile(): void {
    setMobileOpen(false);
    endQuickCreateSession(entry);
    inputRef.current?.blur();
  }

  const value = draft?.title ?? "";
  const targetLabel = label ?? text("任务", "tasks");
  const inputLabel = contextual
    ? text(`在${targetLabel}添加任务`, `Add a task to ${targetLabel}`)
    : text("快速添加任务", "Quickly add a task");
  const submitLabel = contextual
    ? text(`提交到${targetLabel}`, `Submit to ${targetLabel}`)
    : text("添加任务", "Add task");
  return (
    <>
      <div
        className={`quick-create-shell ${contextual ? "is-contextual" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
      >
        <form className="quick-create" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            aria-label={inputLabel}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={1000}
            placeholder={
              contextual
                ? text(`添加到${targetLabel}`, `Add to ${targetLabel}`)
                : text("添加一项任务", "Add a task")
            }
            value={value}
            onChange={(event) =>
              updateDraft(
                entry,
                event.currentTarget.value,
                event.currentTarget.selectionStart ?? event.currentTarget.value.length,
              )
            }
            onSelect={(event) => {
              if (event.currentTarget.value === "") return;
              updateDraft(
                entry,
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
              aria-label={text("清空草稿", "Clear draft")}
              title={text("清空草稿", "Clear draft")}
              onClick={() => {
                updateDraft(entry, "", 0);
                inputRef.current?.focus();
              }}
            >
              <X size={17} aria-hidden="true" />
            </button>
          ) : null}
          <button
            className="icon-button add-button"
            type="submit"
            aria-label={submitLabel}
            title={submitLabel}
            disabled={value.trim().length === 0}
          >
            <Plus size={19} aria-hidden="true" />
          </button>
        </form>
        {!contextual ? <DraftStorageNotice /> : null}
      </div>

      {!contextual ? (
        <button
          className={`mobile-create-trigger ${mobileOpen ? "is-open" : ""}`}
          type="button"
          aria-label={
            mobileOpen
              ? text("关闭快速添加", "Close quick create")
              : text("打开快速添加", "Open quick create")
          }
          title={
            mobileOpen
              ? text("关闭快速添加", "Close quick create")
              : text("打开快速添加", "Open quick create")
          }
          onClick={mobileOpen ? closeMobile : openMobile}
        >
          {mobileOpen ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Plus size={26} aria-hidden="true" />
          )}
        </button>
      ) : null}
    </>
  );
}
