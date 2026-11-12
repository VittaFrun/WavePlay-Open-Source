export type LyricLine = { time?: number; text: string };

const timeTag = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLyrics(text: string): LyricLine[] {
  const parsed: LyricLine[] = [];
  const offset = Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  text.replace(/\r/g, "").split("\n").forEach((raw) => {
    if (/^\s*\[(ar|al|ti|au|by|re|ve|length|offset):.*\]\s*$/i.test(raw)) return;
    const tags = [...raw.matchAll(timeTag)];
    const lyric = raw.replace(timeTag, "").trim();
    if (!tags.length) {
      if (lyric) parsed.push({ text: lyric });
      return;
    }
    tags.forEach((tag) => {
      const minutes = Number(tag[1]);
      const seconds = Number(tag[2]);
      if (seconds >= 60) return;
      const fraction = Number(`0.${tag[3] || "0"}`);
      parsed.push({ time: Math.max(0, minutes * 60 + seconds + fraction - offset), text: lyric || "♪" });
    });
  });
  return parsed.sort((a, b) => (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER));
}

export function lyricAt(lines: LyricLine[], position: number) {
  // parseLyrics sorts timed lines first. Find the last matching timestamp;
  // duplicate timestamps select the last line just as the linear scan did.
  if(Number.isNaN(position))return -1;
  let lower=0,upper=lines.length;
  while(lower<upper){
    const middle=Math.floor((lower+upper)/2),time=lines[middle].time;
    if(time!==undefined&&time<=position)lower=middle+1;
    else upper=middle;
  }
  return lower-1;
}
