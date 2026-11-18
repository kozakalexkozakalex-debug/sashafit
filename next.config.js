/** @type {import('next').NextConfig} */
const nextConfig = {
  // Збірка «standalone» кладе в .next/standalone усе потрібне для запуску
  // (Dockerfile на VPS/Coolify). На Vercel цей режим просто ігнорується.
  output: "standalone",
  // Короткий номер версії — показується внизу екрана «Ще», щоб одразу бачити, чи оновився застосунок.
  env: {
    NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7),
  },
  // Telegram любить кешувати сторінки Mini App — просимо його щоразу брати свіжу версію.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|.*\\..*).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

module.exports = nextConfig;
