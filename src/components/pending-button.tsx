"use client";
import { useFormStatus } from "react-dom";

/**
 * Botão de formulário que trava enquanto a ação roda (evita cliques repetidos)
 * e, se `confirm` vier, pede confirmação antes de enviar.
 */
export function PendingButton({
  children,
  pendingLabel,
  confirm,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
