export function kg(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Number(n.toFixed(digits))} кг`
}

export function km(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Number(n.toFixed(2))} км`
}

export function int(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return Math.round(n).toLocaleString('ru-RU')
}

/** Russian plural helper: plural(3, ['подход','подхода','подходов']) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}
