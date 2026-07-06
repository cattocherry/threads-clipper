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

  function cubic(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    thickness: number,
    color: [number, number, number, number],
    dashed = false
  ) {
    let previous: [number, number] | null = null;
    for (let step = 0; step <= 96; step += 1) {
      const t = step / 96;
      const u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
      const next: [number, number] = [Math.round(x), Math.round(y)];
      if (previous && (!dashed || Math.floor(step / 8) % 2 === 0)) {
        line(previous[0], previous[1], next[0], next[1], thickness, color);
      }
      previous = next;
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
  cubic(69, 51, 99, 31, 136, 28, 170, 42, 3, [139, 142, 148, 255], true);
  cubic(29, 52, 55, 52, 74, 62, 88, 78, 3, [245, 197, 24, 255]);
  cubic(61, 115, 91, 89, 125, 84, 152, 97, 3, [61, 79, 153, 255]);
  cubic(92, 88, 112, 97, 134, 96, 150, 90, 2, [242, 241, 237, 255]);
  line(87, 78, 107, 102, 2, [139, 142, 148, 255]);
  line(150, 90, 126, 137, 2, [139, 142, 148, 255]);
  fillCircle(29, 52, 20, [245, 197, 24, 255]);
  fillCircle(61, 115, 19, [61, 79, 153, 255]);
  fillCircle(152, 97, 21, [242, 241, 237, 255]);
  ellipse(88, 78, 5, 5, 0, 2, [242, 241, 237, 255]);
  ellipse(107, 102, 5, 5, 0, 2, [242, 241, 237, 255]);
  ellipse(150, 90, 5, 5, 0, 2, [242, 241, 237, 255]);

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
