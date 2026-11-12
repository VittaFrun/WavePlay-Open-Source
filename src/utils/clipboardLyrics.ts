export function looksLikeLyricsText(value:string) {
  const text=value.trim();
  if(text.length<24||text.length>20000||/^https?:\/\//i.test(text))return false;
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  return /^\[\d{1,2}:\d{2}(?:[.,]\d+)?\]/m.test(text) || (lines.length>=3 && lines.some(line=>/[\p{L}]{2,}/u.test(line)));
}
