// Друк/PDF без нових бібліотек: відкриваємо нове вікно з готовим HTML
// і одразу просимо браузер надрукувати. На "Зберегти як PDF" тиснуть
// вже в самому діалозі друку — так само, як "Друкувати сторінку" звідки
// завгодно в браузері.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openPrintWindow(title: string, bodyHtml: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Браузер заблокував нове вікно. Дозволь спливаючі вікна для цього сайту і спробуй ще раз.");
    return;
  }
  w.document.write(`<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 28px; color: #111; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 4px; }
  td, th { padding: 5px 6px; text-align: left; border-bottom: 1px solid #eee; }
  th { color: #888; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .muted { color: #888; font-size: 12px; margin: 0 0 8px; }
  .total { font-weight: 600; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>${bodyHtml}</body>
</html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}
