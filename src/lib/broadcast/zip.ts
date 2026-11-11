// A streamed ZIP of stored (uncompressed) files, for the broadcast team's
// photo download. JPEGs do not shrink, so nothing is compressed: each entry
// is a local header and the bytes as they are, sent as soon as they are
// known, then the central directory and the end record. The archive is never
// held in memory whole. No ZIP64: the archive stays far below 4 GB (about
// 20 MB of photos) and the writer refuses to go past the limit.
//
// CRC-32 comes from the xlsx writer, which imports only node:zlib, so the
// tests can load this file directly.
import { crc32 } from "../xlsx/write-xlsx.ts";

const textEncoder = new TextEncoder();

/* General purpose flag bit 11: the name is UTF-8. */
const UTF8_FLAG = 1 << 11;
const ZIP32_LIMIT = 0xffffffff;
const MAX_ENTRIES = 0xffff;

/* DOS date and time, local fields as written (ZIP has no time zone). */
export const dosDateTime = (date: Date) => {
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
};

type CentralRecord = { name: Uint8Array; crc: number; size: number; offset: number };

/* Feed it files one at a time; each call returns the bytes to send next. */
export const createStoredZipWriter = (stamp: Date = new Date()) => {
  const { time, date } = dosDateTime(stamp);
  const central: CentralRecord[] = [];
  let offset = 0;
  let finished = false;

  const addFile = (fileName: string, data: Uint8Array): Uint8Array[] => {
    if (finished) {
      throw new Error("The archive is already finished.");
    }

    const name = textEncoder.encode(fileName);

    if (name.length === 0 || name.length > 0xffff) {
      throw new Error("Invalid file name.");
    }

    if (central.length >= MAX_ENTRIES || offset + 30 + name.length + data.length > ZIP32_LIMIT) {
      throw new Error("The archive is too large.");
    }

    const crc = crc32(data);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x04034b50, true); // local file header signature
    view.setUint16(4, 20, true); // version needed to extract (2.0)
    view.setUint16(6, UTF8_FLAG, true); // flags
    view.setUint16(8, 0, true); // method: stored
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true); // compressed size
    view.setUint32(22, data.length, true); // uncompressed size
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true); // extra field length
    header.set(name, 30);

    central.push({ name, crc, size: data.length, offset });
    offset += header.length + data.length;

    return [header, data];
  };

  /* The central directory and the end record. */
  const finish = (): Uint8Array => {
    if (finished) {
      throw new Error("The archive is already finished.");
    }

    finished = true;

    const centralSize = central.reduce((total, entry) => total + 46 + entry.name.length, 0);

    if (offset + centralSize + 22 > ZIP32_LIMIT) {
      throw new Error("The archive is too large.");
    }

    const output = new Uint8Array(centralSize + 22);
    const view = new DataView(output.buffer);
    let at = 0;

    for (const entry of central) {
      view.setUint32(at, 0x02014b50, true); // central directory header signature
      view.setUint16(at + 4, 20, true); // version made by (2.0, MS-DOS)
      view.setUint16(at + 6, 20, true); // version needed to extract
      view.setUint16(at + 8, UTF8_FLAG, true); // flags
      view.setUint16(at + 10, 0, true); // method: stored
      view.setUint16(at + 12, time, true);
      view.setUint16(at + 14, date, true);
      view.setUint32(at + 16, entry.crc, true);
      view.setUint32(at + 20, entry.size, true);
      view.setUint32(at + 24, entry.size, true);
      view.setUint16(at + 28, entry.name.length, true);
      view.setUint16(at + 30, 0, true); // extra field length
      view.setUint16(at + 32, 0, true); // comment length
      view.setUint16(at + 34, 0, true); // disk number start
      view.setUint16(at + 36, 0, true); // internal attributes
      view.setUint32(at + 38, 0, true); // external attributes
      view.setUint32(at + 42, entry.offset, true); // local header offset
      output.set(entry.name, at + 46);
      at += 46 + entry.name.length;
    }

    view.setUint32(at, 0x06054b50, true); // end of central directory signature
    view.setUint16(at + 4, 0, true); // this disk
    view.setUint16(at + 6, 0, true); // disk with the central directory
    view.setUint16(at + 8, central.length, true); // entries on this disk
    view.setUint16(at + 10, central.length, true); // entries in total
    view.setUint32(at + 12, centralSize, true); // central directory size
    view.setUint32(at + 16, offset, true); // central directory offset
    view.setUint16(at + 20, 0, true); // comment length

    return output;
  };

  return { addFile, finish };
};

/* `work` over `items` with at most `limit` running at once, results yielded
   in the items' order. Starts the next item only as results are taken, so a
   slow reader holds back the downloads too. */
export async function* mapInOrder<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>
): AsyncGenerator<R> {
  const running: Promise<R>[] = [];
  let next = 0;

  const startMore = () => {
    while (running.length < limit && next < items.length) {
      const result = work(items[next]);
      // Awaited in turn below; this only stops a failure that is not yet
      // awaited from being reported as unhandled.
      result.catch(() => {});
      running.push(result);
      next += 1;
    }
  };

  startMore();

  while (running.length > 0) {
    const result = await running.shift()!;
    startMore();
    yield result;
  }
}

export type ZipSourceFile =
  | { name: string; data: Uint8Array }
  /* A file that could not be read: left out, and listed in missing.txt. */
  | { name: string; data: null; note?: string };

export const MISSING_LIST_NAME = "missing.txt";

/* The archive as a stream: every readable file in order, then, when any
   could not be read, missing.txt listing them (one per line). */
export const zipStream = (files: AsyncIterable<ZipSourceFile>, stamp: Date = new Date()) => {
  const writer = createStoredZipWriter(stamp);
  const iterator = files[Symbol.asyncIterator]();
  const missing: string[] = [];
  let done = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) {
        return;
      }

      try {
        /* A pull that enqueues nothing is not called again, so a missing
           file moves straight on to the next one. */
        let step = await iterator.next();

        while (!step.done) {
          const file = step.value;

          if (file.data) {
            for (const chunk of writer.addFile(file.name, file.data)) {
              controller.enqueue(chunk);
            }

            return;
          }

          missing.push(file.note ? `${file.name}\t${file.note}` : file.name);
          step = await iterator.next();
        }

        done = true;

        if (missing.length > 0) {
          const list = textEncoder.encode(
            `These photos could not be downloaded and are not in this archive:\r\n${missing.join("\r\n")}\r\n`
          );

          for (const chunk of writer.addFile(MISSING_LIST_NAME, list)) {
            controller.enqueue(chunk);
          }
        }

        controller.enqueue(writer.finish());
        controller.close();
      } catch (error) {
        done = true;
        controller.error(error);
      }
    },
    async cancel() {
      done = true;
      await iterator.return?.();
    },
  });
};
