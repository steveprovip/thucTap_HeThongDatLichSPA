/** Loại ảnh nhận diện theo "magic bytes" ở đầu tệp, KHÔNG tin Content-Type do client tự khai (QA-22). */
export type ImageSignature = 'png' | 'jpeg';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (buf: Uint8Array, sig: number[]): boolean =>
  buf.length >= sig.length && sig.every((b, i) => buf[i] === b);

export const detectImageSignature = (head: Uint8Array): ImageSignature | null => {
  if (startsWith(head, PNG)) return 'png';
  if (startsWith(head, JPEG)) return 'jpeg';
  return null;
};
