/** PM2 — rode a partir da pasta do projeto na VPS */
module.exports = {
  apps: [
    {
      name: "gerador-reels",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3010",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3010",
      },
    },
  ],
};
