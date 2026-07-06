import type { NextConfig } from "next";

// GOAL-12 — Build alvo mobile (Capacitor).
// `BUILD_TARGET=mobile` (script build:mobile) liga o export estático em `out/`,
// transformando o app numa SPA 100% client-side que o WebView do Capacitor
// serve a partir de arquivos locais. O build web normal (`next build`) NÃO é
// afetado: continua com o comportamento padrão de servidor do Next.
const isMobileBuild = process.env.BUILD_TARGET === "mobile";

const mobileConfig: NextConfig = {
  output: "export",
  // Sem servidor de otimização de imagem no export: serve o arquivo original.
  // O app não usa next/image hoje, mas isto deixa o export à prova de futuro.
  images: { unoptimized: true },
};

const nextConfig: NextConfig = {
  ...(isMobileBuild ? mobileConfig : {}),

  // Em desenvolvimento, o Next 16 bloqueia por padrão o acesso cross-origin
  // aos recursos do dev server (chunks JS / HMR). Ao abrir o app pelo IP da
  // rede no celular (ex.: http://192.168.0.6:3000), o HTML carrega mas o
  // JavaScript do cliente é bloqueado -> a página não hidrata e os botões
  // ficam visíveis porém NÃO clicáveis. Liberar os origins da LAN resolve.
  //
  // Apenas DEV. Não afeta o build de produção.
  allowedDevOrigins: [
    "192.168.0.6", // IP atual da máquina na Wi-Fi
    "192.168.*.*", // qualquer sub-rede doméstica 192.168.x.x
    "10.*.*.*", // redes 10.x.x.x
    "172.*.*.*", // redes 172.x.x.x
  ],
};

export default nextConfig;
