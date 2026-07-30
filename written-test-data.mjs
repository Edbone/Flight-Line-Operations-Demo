export function parseWrittenTestHistory(source = "") {
  return String(source).split(/\r?\n/).slice(1).map((line, index) => {
    if (!line.trim()) return null;
    const [student = "", date = "", time = "", test = "", scoreRaw = "", initials = ""] = line.split("\t");
    if (!student.trim() || !test.trim()) return null;
    const scoreMatch = scoreRaw.match(/\d+(?:\.\d+)?/);
    const parsedDate = date ? new Date(`${date} ${time || "12:00 PM"}`) : null;
    return { id: `imported-${index}`, student: student.trim().replace(/\s+/g, " "), test: test.trim().toUpperCase(), score: scoreMatch ? Number(scoreMatch[0]) : null, takenAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : "", initials: initials.trim().toUpperCase(), notes: scoreMatch ? "" : scoreRaw.trim(), imported: true };
  }).filter(Boolean);
}

export async function loadWrittenTestHistory(url = "assets/written-test-history.tsv") {
  const response = await fetch(url);
  if (!response.ok) return [];
  return parseWrittenTestHistory(await response.text());
}
