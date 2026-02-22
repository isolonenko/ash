import type { DataChannelMessage } from "@/types";
import {
  FILE_CHUNK_SIZE,
  FILE_CHUNK_BATCH_SIZE,
  FILE_CHUNK_BATCH_DELAY,
} from "@/lib/constants";

export interface IncomingFile {
  name: string;
  size: number;
  totalChunks: number;
  chunks: Map<number, string>;
}

interface FileChunkInfo {
  fileId: string;
  chunkIndex: number;
  data: string;
}

interface FileMetaInfo {
  id: string;
  name: string;
  size: number;
  totalChunks: number;
}

export const reassembleChunks = (
  file: IncomingFile,
): Uint8Array => {
  const parts = Array.from({ length: file.totalChunks }, (_, i) => {
    const b64 = file.chunks.get(i)!;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  });

  const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
  const combined = new Uint8Array(totalLen);

  parts.reduce((offset, part) => {
    combined.set(part, offset);
    return offset + part.length;
  }, 0);

  return combined;
};

export const handleFileChunk = (
  incomingFiles: Map<string, IncomingFile>,
  chunk: FileChunkInfo,
): { name: string; data: Uint8Array } | null => {
  const file = incomingFiles.get(chunk.fileId);
  if (!file) return null;

  file.chunks.set(chunk.chunkIndex, chunk.data);

  if (file.chunks.size === file.totalChunks) {
    const data = reassembleChunks(file);
    incomingFiles.delete(chunk.fileId);
    return { name: file.name, data };
  }

  return null;
};

export const handleFileMeta = (
  incomingFiles: Map<string, IncomingFile>,
  meta: FileMetaInfo,
): void => {
  incomingFiles.set(meta.id, {
    name: meta.name,
    size: meta.size,
    totalChunks: meta.totalChunks,
    chunks: new Map(),
  });
};

export const sendFileChunked = async (
  file: File,
  send: (msg: DataChannelMessage) => void,
): Promise<string> => {
  const fileId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / FILE_CHUNK_SIZE);

  send({
    type: "file-meta",
    payload: { id: fileId, name: file.name, size: file.size, totalChunks },
  });

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const sendChunk = async (index: number): Promise<void> => {
    if (index >= totalChunks) return;

    const start = index * FILE_CHUNK_SIZE;
    const end = Math.min(start + FILE_CHUNK_SIZE, file.size);
    const chunk = bytes.slice(start, end);
    const base64 = btoa(String.fromCharCode(...chunk));

    send({
      type: "file-chunk",
      payload: { fileId, chunkIndex: index, data: base64 },
    });

    const needsDelay =
      index > 0 && index % FILE_CHUNK_BATCH_SIZE === 0;

    if (needsDelay) {
      await new Promise<void>((r) => setTimeout(r, FILE_CHUNK_BATCH_DELAY));
    }

    return sendChunk(index + 1);
  };

  await sendChunk(0);
  return fileId;
};
