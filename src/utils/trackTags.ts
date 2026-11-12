export function normalizeTagText(value: string): string {
  return value.replace(/\uFEFF/g, '').replace(/^[\s\u200B-\u200D\u2060]+|[\s\u200B-\u200D\u2060]+$/g, '');
}

export function canEditAudioTags(filename: string): boolean {
  return /\.(mp3|m4a)$/i.test(filename);
}
