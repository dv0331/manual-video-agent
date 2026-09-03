export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[{[]/);
  if (start === -1) {
    throw new Error("Model did not return JSON");
  }
  const sliced = candidate.slice(start);
  try {
    return JSON.parse(sliced) as T;
  } catch {
    const endObj = sliced.lastIndexOf("}");
    const endArr = sliced.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end > 0) {
      return JSON.parse(sliced.slice(0, end + 1)) as T;
    }
    throw new Error("Could not parse JSON from model output");
  }
}
