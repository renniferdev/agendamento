import { useEffect, useRef, useState } from "react";

/**
 * Botão oficial "Continuar com Google" (Google Identity Services). Devolve o
 * ID token (`credential`), que o backend valida. O domínio do site precisa
 * estar em "Origens JavaScript autorizadas" no Google Cloud Console.
 */

interface GoogleIdentityApi {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityApi } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Permite tentar de novo numa próxima montagem.
      scriptPromise = null;
      script.remove();
      reject(new Error("Falha ao carregar o login do Google."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function GoogleSignInButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // O Google guarda o callback do initialize; a ref mantém a versão atual.
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        const container = containerRef.current;
        if (cancelled || !container || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => callbackRef.current(credential),
        });
        window.google.accounts.id.renderButton(container, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          locale: "pt-BR",
          width: Math.min(container.offsetWidth || 320, 400),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (failed) {
    return <p className="text-center text-xs text-muted">Login com Google indisponível no momento.</p>;
  }
  return <div ref={containerRef} className="flex min-h-10 w-full justify-center" />;
}
