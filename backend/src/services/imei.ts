// =====================================================================
// Validação de IMEI
// =====================================================================
// IMEI tem 15 dígitos, sendo o último um dígito verificador calculado
// pelo algoritmo de Luhn. Validar aqui pega erro de digitação na hora.
// Espelha frontend/src/lib/imei.ts.

/** Luhn: soma com dobra alternada a partir da direita; válido se % 10 == 0. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48; // '0' = 48
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Remove tudo que não for dígito (tolera espaços/hífens colados). */
export function normalizeImei(value: string): string {
  return value.replace(/\D/g, '');
}

/** True se for exatamente 15 dígitos e passar no Luhn. */
export function isValidImei(value: string): boolean {
  const digits = value.trim();
  return /^\d{15}$/.test(digits) && luhnValid(digits);
}
