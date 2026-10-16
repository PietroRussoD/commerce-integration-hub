import { type KeyboardEvent, type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";

interface ModalDialogProps {
  children: ReactNode;
  labelledBy: string;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export function ModalDialog({ children, labelledBy, initialFocusRef, onClose }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    initialFocusRef.current?.focus();
    document.body.style.overflow = "hidden";

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      // Wait for React to remove the dialog and any action that became unavailable.
      queueMicrotask(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
        else document.getElementById("main-content")?.focus();
      });
    };
  }, [initialFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={keepFocusInDialog}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-md border border-app-border bg-app-surface p-5 text-app-foreground shadow-xl backdrop:bg-black/45"
    >
      {children}
    </dialog>
  );
}

function keepFocusInDialog(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;

  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    "a[href], button, input, select, textarea, [tabindex]",
  )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (first === undefined || last === undefined) return;

  // Native modality makes the background inert, but some browsers let Tab move
  // to browser chrome. Wrap explicitly to keep the keyboard position in the form.
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
