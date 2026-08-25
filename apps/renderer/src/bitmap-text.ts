const glyphs: Record<string, string[]> = {
  A:["01110","10001","10001","11111","10001","10001","10001"], B:["11110","10001","10001","11110","10001","10001","11110"],
  C:["01111","10000","10000","10000","10000","10000","01111"], D:["11110","10001","10001","10001","10001","10001","11110"],
  E:["11111","10000","10000","11110","10000","10000","11111"], F:["11111","10000","10000","11110","10000","10000","10000"],
  G:["01111","10000","10000","10111","10001","10001","01111"], H:["10001","10001","10001","11111","10001","10001","10001"],
  I:["11111","00100","00100","00100","00100","00100","11111"], J:["00111","00010","00010","00010","10010","10010","01100"],
  K:["10001","10010","10100","11000","10100","10010","10001"], L:["10000","10000","10000","10000","10000","10000","11111"],
  M:["10001","11011","10101","10101","10001","10001","10001"], N:["10001","11001","10101","10011","10001","10001","10001"],
  O:["01110","10001","10001","10001","10001","10001","01110"], P:["11110","10001","10001","11110","10000","10000","10000"],
  Q:["01110","10001","10001","10001","10101","10010","01101"], R:["11110","10001","10001","11110","10100","10010","10001"],
  S:["01111","10000","10000","01110","00001","00001","11110"], T:["11111","00100","00100","00100","00100","00100","00100"],
  U:["10001","10001","10001","10001","10001","10001","01110"], V:["10001","10001","10001","10001","10001","01010","00100"],
  W:["10001","10001","10001","10101","10101","10101","01010"], X:["10001","10001","01010","00100","01010","10001","10001"],
  Y:["10001","10001","01010","00100","00100","00100","00100"], Z:["11111","00001","00010","00100","01000","10000","11111"],
  "0":["01110","10001","10011","10101","11001","10001","01110"], "1":["00100","01100","00100","00100","00100","00100","01110"],
  "2":["01110","10001","00001","00010","00100","01000","11111"], "3":["11110","00001","00001","01110","00001","00001","11110"],
  "4":["00010","00110","01010","10010","11111","00010","00010"], "5":["11111","10000","10000","11110","00001","00001","11110"],
  "6":["01110","10000","10000","11110","10001","10001","01110"], "7":["11111","00001","00010","00100","01000","01000","01000"],
  "8":["01110","10001","10001","01110","10001","10001","01110"], "9":["01110","10001","10001","01111","00001","00001","01110"],
  "-":["00000","00000","00000","11111","00000","00000","00000"], ".":["00000","00000","00000","00000","00000","00110","00110"],
  "?":["01110","10001","00001","00010","00100","00000","00100"]
};

function linesFor(text: string, maxCharacters: number) {
  const words = text.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").toUpperCase().trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + 1 + word.length > maxCharacters) lines.push(word.slice(0, maxCharacters));
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 2).length ? lines.slice(0, 2) : ["ADFLOW"];
}

export function renderTextPpm(input: {
  text: string;
  width: number;
  height: number;
  scale: number;
  foreground?: [number, number, number];
  background?: [number, number, number];
}) {
  const foreground = input.foreground ?? [255, 255, 255];
  const background = input.background ?? [12, 20, 16];
  const pixels = new Uint8Array(input.width * input.height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) pixels.set(background, offset);
  const charWidth = 6 * input.scale;
  const lineHeight = 9 * input.scale;
  const lines = linesFor(input.text, Math.max(1, Math.floor((input.width - 24) / charWidth)));
  const top = Math.max(0, Math.floor((input.height - lines.length * lineHeight) / 2));
  lines.forEach((line, lineIndex) => {
    const left = Math.max(0, Math.floor((input.width - line.length * charWidth) / 2));
    [...line].forEach((character, characterIndex) => {
      if (character === " ") return;
      const glyph = glyphs[character] ?? glyphs["?"]!;
      glyph.forEach((row, y) => [...row].forEach((bit, x) => {
        if (bit !== "1") return;
        for (let dy = 0; dy < input.scale; dy += 1) for (let dx = 0; dx < input.scale; dx += 1) {
          const px = left + characterIndex * charWidth + x * input.scale + dx;
          const py = top + lineIndex * lineHeight + y * input.scale + dy;
          if (px < input.width && py < input.height) pixels.set(foreground, (py * input.width + px) * 3);
        }
      }));
    });
  });
  const header = new TextEncoder().encode(`P6\n${input.width} ${input.height}\n255\n`);
  const output = new Uint8Array(header.byteLength + pixels.byteLength);
  output.set(header);
  output.set(pixels, header.byteLength);
  return output;
}
