// Normalización de texto compartida por el clasificador, el buscador de
// servicios y las validaciones. Todo se compara sin tildes ni mayúsculas.

const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "en",
  "con", "para", "por", "a", "al", "del", "que", "me", "mi", "tu", "su", "se",
  "es", "son", "lo", "le", "les", "si", "no", "como", "cuanto", "cuanta",
  "cuesta", "cuestan", "precio", "precios", "costo", "tienen", "tiene", "hacen",
  "hace", "quiero", "quisiera", "queria", "saber", "info", "informacion",
  "hola", "buenas", "buenos", "dias", "tardes", "noches", "favor", "porfa",
  "oye", "doctora", "doctor", "dra", "dr", "alguna", "algun", "sobre", "del",
  "esta", "este", "esos", "esas", "ese", "esa", "mas", "muy", "ya", "u", "e",
]);

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s?%$/.,!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function singularize(token: string): string {
  if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function rawWords(input: string): string[] {
  return normalize(input)
    .replace(/[?%$/.,!]/g, " ")
    .split(" ")
    .filter(Boolean);
}

export function tokenize(input: string): string[] {
  return rawWords(input)
    .filter((t) => !STOPWORDS.has(t))
    .map(singularize);
}

/** Distancia de edición (Levenshtein) acotada: true si a y b difieren en <= max ediciones. */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Primer nombre presentable, o "" si no es confiable (emojis, apodos raros). */
export function cleanFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,15}$/.test(first)) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
