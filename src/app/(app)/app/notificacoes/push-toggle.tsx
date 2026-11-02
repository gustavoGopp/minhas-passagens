"use client";
import { useEffect, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "./actions";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "checking" | "unsupported" | "needs-install" | "off" | "on" | "denied" | "error";

export function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        setStatus(ios && !standalone ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("error"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/key");
      if (!res.ok) throw new Error("sem chave");
      const { key } = (await res.json()) as { key: string };
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
      setStatus("on");
    } catch {
      setStatus(Notification.permission === "denied" ? "denied" : "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await removePushSubscriptionAction(sub.endpoint);
      await sub.unsubscribe();
    }
    setStatus("off");
    setBusy(false);
  }

  const text: Record<Status, string> = {
    checking: "Verificando…",
    unsupported: "Este navegador não suporta notificações push.",
    "needs-install":
      "No iPhone: toque em Compartilhar → Adicionar à Tela de Início, abra o app por lá e volte aqui.",
    off: "Desligado neste aparelho.",
    on: "Ligado neste aparelho.",
    denied: "Permissão negada. Libere as notificações deste site nas configurações do navegador.",
    error: "Não foi possível ativar agora. Tente de novo.",
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{text[status]}</p>
      {status === "off" || status === "error" ? (
        <button
          onClick={enable}
          disabled={busy}
          className="self-start rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Ativando…" : "Ativar neste aparelho"}
        </button>
      ) : null}
      {status === "on" ? (
        <button
          onClick={disable}
          disabled={busy}
          className="self-start text-xs underline underline-offset-2"
        >
          Desligar neste aparelho
        </button>
      ) : null}
    </div>
  );
}
