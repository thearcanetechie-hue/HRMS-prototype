import { PDFDocument } from 'pdf-lib';

const A4 = { width: 595.28, height: 841.89 };

/** Builds one A4 PDF with each image (JPEG or PNG) scaled to fit its own page. */
export async function imagesToPdf(images: File[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (const file of images) {
    const bytes = await file.arrayBuffer();
    const img = file.type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const scale = Math.min(A4.width / img.width, A4.height / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = pdf.addPage([A4.width, A4.height]);
    page.drawImage(img, { x: (A4.width - w) / 2, y: (A4.height - h) / 2, width: w, height: h });
  }
  return new Blob([(await pdf.save()).slice()], { type: 'application/pdf' });
}

/** Joins PDFs in the order given. */
export async function mergePdfs(files: Blob[]): Promise<Blob> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
  }
  return new Blob([(await out.save()).slice()], { type: 'application/pdf' });
}

/**
 * Turns phone photos (HEIC aside) into JPEG the PDF builder accepts, shrinking very large
 * images so a scan stays well under the 20 MB upload limit.
 */
export async function normaliseImage(file: File, maxSide = 2200): Promise<File> {
  if (file.type === 'image/png' && file.size < 4e6) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not read image'))),
      'image/jpeg',
      0.85,
    ),
  );
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
