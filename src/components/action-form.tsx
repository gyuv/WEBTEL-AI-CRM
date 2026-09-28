"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/result";
import { Button } from "@/components/ui";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Form bound to a server action; shows errors, resets and refreshes on success. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className,
  resetOnSuccess = true,
  confirm,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (state.redirect) router.push(state.redirect);
      else {
        if (resetOnSuccess) ref.current?.reset();
        router.refresh();
      }
    }
  }, [state, router, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && !state.ok && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      {state?.ok && state.message && <p className="mt-2 text-sm text-emerald-700">{state.message}</p>}
      {submitLabel && (
        <div className="mt-3">
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
