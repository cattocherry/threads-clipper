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

  function ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    thickness: number,
    color: [number, number, number, number]
  ) {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    let previous: [number, number] | null = null;
    for (let step = 0; step <= 96; step += 1) {
      const theta = (step / 96) * Math.PI * 2;
      const x = rx * Math.cos(theta);
      const y = ry * Math.sin(theta);
      const next: [number, number] = [Math.round(cx + x * cos - y * sin), Math.round(cy + x * sin + y * cos)];
      if (previous) line(previous[0], previous[1], next[0], next[1], thickness, color);
      previous = next;
    }
  }

  for (let y = 0; y < SIZE; y += 1) {
    data[y * (SIZE * 4 + 1)] = 0;
  }

  fillRect(0, 0, SIZE, SIZE, [20, 21, 24, 255]);
  line(37, 69, 73, 57, 3, [242, 241, 237, 255]);
  line(73, 57, 112, 57, 3, [242, 241, 237, 255]);
  line(112, 57, 146, 70, 3, [242, 241, 237, 255]);
  line(88, 52, 101, 105, 2, [139, 142, 148, 255]);
  line(56, 65, 47, 116, 2, [139, 142, 148, 255]);
  line(132, 70, 146, 126, 2, [139, 142, 148, 255]);
  line(37, 120, 83, 128, 2, [139, 142, 148, 255]);
  line(123, 131, 168, 138, 2, [139, 142, 148, 255]);
  fillCircle(103, 109, 11, [245, 197, 24, 255]);
  ellipse(47, 124, 24, 13, -13, 2, [242, 241, 237, 255]);
  ellipse(150, 139, 30, 16, 9, 2, [139, 142, 148, 255]);

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
