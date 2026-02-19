import archiver from "archiver";
import { createWriteStream, createReadStream } from "fs";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import type { Writable } from "stream";

export interface EpubFile {
  path: string;
  content: string | Buffer;
  compressionLevel?: number;
}

export async function createEpubZip(files: EpubFile[], outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  
  const output = createWriteStream(outputPath);
  const archive = archiver("zip", {
    zlib: { level: 9 }
  });

  return new Promise((resolve, reject) => {
    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));
    
    archive.pipe(output);

    // mimetype must be first and uncompressed
    const mimetypeFile = files.find(f => f.path === "mimetype");
    if (mimetypeFile) {
      archive.append(mimetypeFile.content, {
        name: "mimetype",
        store: true
      });
    }

    // Add other files
    for (const file of files) {
      if (file.path === "mimetype") continue;
      archive.append(file.content, { name: file.path });
    }

    archive.finalize();
  });
}

export function createEpubStream(files: EpubFile[]): archiver.Archiver {
  const archive = archiver("zip", {
    zlib: { level: 9 }
  });

  // mimetype must be first and uncompressed
  const mimetypeFile = files.find(f => f.path === "mimetype");
  if (mimetypeFile) {
    archive.append(mimetypeFile.content, {
      name: "mimetype",
      store: true
    });
  }

  // Add other files
  for (const file of files) {
    if (file.path === "mimetype") continue;
    archive.append(file.content, { name: file.path });
  }

  archive.finalize();
  return archive;
}
