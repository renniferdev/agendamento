import { useEffect, useState } from "react";
import { Alert } from "./ui";

/** QR Code do link público da loja, gerado no próprio navegador (sem serviço externo). */
export function StoreQrCode({ url, fileName }: { url: string; fileName: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    // Carregada sob demanda: a página dos clientes não precisa da biblioteca.
    import("qrcode")
      // 1024 px com margem branca: fica nítido impresso e a câmera lê com facilidade.
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 1024, margin: 4 }))
      .then((data) => active && setImage(data))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [url]);

  if (failed) return <Alert>Não foi possível gerar o QR Code. Atualize a página e tente de novo.</Alert>;
  if (!image) return <p className="text-sm text-muted">Gerando QR Code…</p>;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
      <img
        src={image}
        alt="QR Code da sua página de agendamento"
        className="size-48 rounded border border-line bg-white"
      />
      <div className="space-y-3 text-center sm:text-left">
        <p className="text-ink-soft">
          Imprima e deixe no balcão ou na vitrine. O cliente aponta a câmera do celular e cai na sua página de
          agendamento.
        </p>
        <a
          href={image}
          download={fileName}
          className="inline-block rounded bg-teal px-4 py-2 font-medium text-white hover:bg-teal-dark"
        >
          Baixar imagem
        </a>
      </div>
    </div>
  );
}
