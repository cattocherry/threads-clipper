import { deflateSync } from "node:zlib";

export const runtime = "nodejs";

const SIZE = 180;

function crc32(buffer: Buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc;
}

function chunk(type: string, bytes: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, bytes])) >>> 0);
  return Buffer.concat([length, name, bytes, crc]);
}

function drawIcon() {
  const data = Buffer.alloc((SIZE * 4 + 1) * SIZE);

  function setPixel(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  function fillRect(x: number, y: number, width: number, height: number, color: [number, number, number, number]) {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) {
        setPixel(xx, yy, ...color);
      }
    }
  }

  function fillCircle(cx: number, cy: number, radius: number, color: [number, number, number, number]) {
    const radiusSquared = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radiusSquared) setPixel(x, y, ...color);
      }
    }
  }

  function line(x0: number, y0: number, x1: number, y1: number, thickness: number, color: [number, number, number, number]) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let index = 0; index <= steps; index += 1) {
      const t = steps === 0 ? 0 : index / steps;
      fillCircle(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), thickness / 2, color);
    }
  }

  for (let y = 0; y < SIZE; y += 1) {
    data[y * (SIZE * 4 + 1)] = 0;
  }

  fillRect(0, 0, SIZE, SIZE, [7, 7, 7, 255]);
  fillRect(47, 53, 86, 15, [245, 245, 245, 255]);
  fillRect(47, 82, 65, 15, [245, 245, 245, 255]);
  fillRect(47, 111, 86, 15, [245, 245, 245, 255]);
  fillCircle(134, 90, 16, [96, 165, 250, 255]);
  line(134, 79, 134, 91, 5, [7, 7, 7, 255]);
  line(134, 91, 144, 98, 5, [7, 7, 7, 255]);

  return data;
}

function png() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(drawIcon())),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

export function GET() {
  return new Response(png(), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
