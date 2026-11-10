import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // endereços antigos continuam funcionando depois da reorganização das telas
  async redirects() {
    return [
      { source: "/config", destination: "/ajustes", permanent: false },
      { source: "/grupos", destination: "/ajustes#grupo", permanent: false },
      { source: "/moderacao", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
