export function normalizeText(text: string): string {
    return text
        .toUpperCase()
        .replace(/[^\w\s,.-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}