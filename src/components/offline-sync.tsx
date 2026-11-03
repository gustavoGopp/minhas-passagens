"use client";
import { useEffect } from "react";
import { OFFLINE_KEY, type OfflineSnapshot } from "@/lib/offline";

/**
 * Registra o service worker e guarda no aparelho os próximos voos, para o app
 * abrir sem internet (no aeroporto). Nada vai ao servidor; falhas são ignoradas
 * (navegação privada, armazenamento cheio).
 */
export function OfflineSync({ snapshot }: { snapshot: OfflineSnapshot | null }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    try {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(snapshot));
    } catch {
      // sem armazenamento: o app só não abre offline
    }
  }, [snapshot]);
  return null;
}

/** Apaga do aparelho os voos guardados (ao sair ou apagar a conta). */
export function clearOfflineData() {
  try {
    localStorage.removeItem(OFFLINE_KEY);
  } catch {
    // nada a fazer
  }
}
