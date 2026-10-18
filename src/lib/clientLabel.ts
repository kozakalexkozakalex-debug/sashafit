// Клієнт може існувати ще без імені: тренер створив лише запрошення,
// а ім'я клієнт вписує сам під час заповнення анкети.
export function clientLabel(c: { name: string | null; invite_code: string }) {
  return c.name && c.name.trim() ? c.name : `Заявка ${c.invite_code.slice(0, 6)}`;
}
