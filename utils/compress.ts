export type CompressResult = { blob: Blob; compressed: boolean; ratio: number };

export async function compressImage(file: File): Promise<CompressResult> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const width = bmp.width;
    const height = bmp.height;
    if (width * height > 60_000_000) {
      bmp.close();
      return { blob: file, compressed: false, ratio: 1 };
    }
    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = height;
    const ctx = cv.getContext("2d");
    if (!ctx) {
      bmp.close();
      return { blob: file, compressed: false, ratio: 1 };
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const quality = /jpe?g/i.test(file.type) ? 0.92 : 1;
    const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.size >= file.size) return { blob: file, compressed: false, ratio: 1 };
    return { blob, compressed: true, ratio: blob.size / file.size };
  } catch {
    return { blob: file, compressed: false, ratio: 1 };
  }
}