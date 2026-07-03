import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
