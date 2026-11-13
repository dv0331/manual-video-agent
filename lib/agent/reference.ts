import sharp from "sharp";

/**
 * Cut the scene's drawing out of a manual page: keep the vertical span the
 * storyboard named, then trim the white margin around the line art.
 */
export async function cropReference(
  pagePath: string,
  crop: { top: number; bottom: number } | undefined,
  outputPath: string,
) {
  const meta = await sharp(pagePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error(`Unreadable page image ${pagePath}`);
  const top = Math.max(0, Math.floor((crop?.top ?? 0) * height));
  const bottom = Math.min(height, Math.ceil((crop?.bottom ?? 1) * height));
  const region = { left: 0, top, width, height: Math.max(bottom - top, Math.round(height * 0.2)) };
  if (region.top + region.height > height) region.top = height - region.height;

  const extracted = await sharp(pagePath)
    .extract(region)
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let drawing = extracted;
  try {
    drawing = await sharp(extracted.data, { raw: extracted.info })
      .trim({ background: "#ffffff", threshold: 24, lineArt: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    drawing = extracted;
  }
  await sharp(drawing.data, { raw: drawing.info })
    .extend({ top: 24, bottom: 24, left: 24, right: 24, background: "#ffffff" })
    .png({ compressionLevel: 1 })
    .toFile(outputPath);
  return outputPath;
}
