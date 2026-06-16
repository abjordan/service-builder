export function linesToText(lines: string[]): string {
  return lines.join("\n");
}

export function textToLines(text: string): string[] {
  const lines = text.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  return lines.slice(0, end);
}
