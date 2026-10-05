/**
 * Base direction for mixed Hebrew/English text: any Hebrew → RTL (so "Manual QA בחברת Gaming" reads
 * naturally), pure Latin → LTR. Safer than dir="auto", which picks LTR whenever the first letter is Latin.
 */
export function textDir(text: string): 'rtl' | 'ltr' {
  return /[\u0590-\u05FF]/.test(text) ? 'rtl' : 'ltr';
}
