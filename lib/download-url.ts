/** Link that saves a film as `<manual name>.mp4` instead of playing it. */
export function downloadUrl(url: string, sourceName: string) {
  const name = `${sourceName.replace(/\.[a-z0-9]+$/i, "") || "assembly"}.mp4`;
  return `${url}${url.includes("?") ? "&" : "?"}download=1&name=${encodeURIComponent(name)}`;
}
