const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** Up to one decimal, Russian separators: 12,5 */
export function n1(n: number): string {
  return nf1.format(Number.isFinite(n) ? n : 0)
}

/** Integer, Russian separators: 2 676 */
export function n0(n: number): string {
  return nf0.format(Number.isFinite(n) ? Math.round(n) : 0)
}

/** "113 ккал · Б 23,6 · Ж 1,9 · У 0,4" */
export function macroLine(m: { kcal: number; proteinG: number; fatG: number; carbsG: number }): string {
  return `${n0(m.kcal)} ккал · Б ${n1(m.proteinG)} · Ж ${n1(m.fatG)} · У ${n1(m.carbsG)}`
}
