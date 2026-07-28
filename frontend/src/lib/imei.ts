// Validação de IMEI (15 dígitos + dígito verificador Luhn).
// Espelha backend/src/services/imei.ts.

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** True se for exatamente 15 dígitos e passar no Luhn. */
export function isValidImei(value: string): boolean {
  const digits = value.trim();
  return /^\d{15}$/.test(digits) && luhnValid(digits);
}
