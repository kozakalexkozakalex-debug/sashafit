/** @type {import('next').NextConfig} */
const nextConfig = {
  // Збірка «standalone» кладе в .next/standalone усе потрібне для запуску
  // (Dockerfile на VPS/Coolify). На Vercel цей режим просто ігнорується.
  output: "standalone",
};

module.exports = nextConfig;
