import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';

import { getErrorMessage } from '@/lib/api';

// Shared camera/gallery-pick + multipart-upload-with-progress helper.
// Built for reuse — Personal Info (identity documents) and My Timesheet
// (work-doc attachments) are the first two call sites; Employee Documents,
// inventory media, expense bill attachments and invoices are expected to
// reuse this rather than reimplementing picking/uploading per screen.
//
// KNOWN RISK, stated plainly rather than claimed fixed: iOS camera capture
// via expo-image-picker has a documented history of returning a null/absent
// `mimeType` on some iOS versions (the SDK docs for this exact version say
// mimeType "may be null if unavailable" without carving out camera vs
// gallery). This file defends against that by always falling back to
// inferring the type from the file extension in the returned `uri`, and by
// giving every picked file a name with a real extension even when the
// picker's own `fileName` is null. That defense was verified by reading the
// picker's documented return shape and by testing the fallback logic in
// isolation (see PickedFile construction below) — NOT by running the app on
// a physical iOS device or simulator. Whether iOS actually exercises the
// null-mimeType path with THIS Expo SDK version, on a real camera capture,
// is unverified. Say so to the person who can run it before trusting this
// blind on a device this session never touched.

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heic',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function extFromUri(uri: string): string | null {
  const clean = uri.split('?')[0].split('#')[0];
  const match = /\.([a-zA-Z0-9]+)$/.exec(clean);
  return match ? match[1].toLowerCase() : null;
}

function inferMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.fileName ? extFromUri(asset.fileName) : extFromUri(asset.uri);
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  // Last resort: expo-image-picker only ever returns photos/videos from
  // these two entry points in this app (mediaTypes is always constrained to
  // 'images' at every call site below), so this default is safe here even
  // though it would be wrong for a generic document picker.
  return 'image/jpeg';
}

function toPickedFile(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const mimeType = inferMimeType(asset);
  const ext = extFromUri(asset.uri) ?? mimeType.split('/')[1] ?? 'jpg';
  const name = asset.fileName ?? `photo-${Date.now()}.${ext}`;
  return {
    uri: asset.uri,
    name,
    mimeType,
    size: asset.fileSize,
    width: asset.width || undefined,
    height: asset.height || undefined,
  };
}

/** Launches the camera. Returns null if permission was denied or the user cancelled. */
export async function pickFromCamera(opts?: { quality?: number }): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: opts?.quality ?? 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return toPickedFile(result.assets[0]);
}

/** Launches the photo library picker. Returns null if permission was denied or the user cancelled. */
export async function pickFromGallery(opts?: { quality?: number }): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: opts?.quality ?? 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return toPickedFile(result.assets[0]);
}

/** Photo library picker with multi-select (Team Chat sends up to `limit` at once). Returns [] if denied or cancelled. */
export async function pickManyFromGallery(limit = 10, opts?: { quality?: number }): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: opts?.quality ?? 0.8,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map(toPickedFile);
}

export interface UploadValidation {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

export function validatePickedFile(file: PickedFile, rules: UploadValidation): string | null {
  if (!rules.allowedMimeTypes.includes(file.mimeType)) {
    return `That file type isn't supported here. Allowed: ${rules.allowedMimeTypes.join(', ')}.`;
  }
  if (file.size != null && file.size > rules.maxSizeBytes) {
    const mb = (rules.maxSizeBytes / (1024 * 1024)).toFixed(0);
    return `File is too large. Maximum size is ${mb}MB.`;
  }
  return null;
}

export type UploadStatus = 'idle' | 'picked' | 'uploading' | 'success' | 'error' | 'cancelled';

/**
 * Per-call-site upload function signature: given the picked file and progress/
 * cancellation hooks, perform the actual multipart POST (via api.ts) and
 * return whatever that endpoint returns. Field name, endpoint path, and any
 * extra form fields are the caller's concern — this hook only owns picking,
 * validation, progress, retry, and cancellation, which are identical across
 * every upload screen.
 */
export type UploadFn<T> = (
  file: PickedFile,
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) => Promise<T>;

export function useFileUpload<T>(rules: UploadValidation) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uploadFnRef = useRef<UploadFn<T> | null>(null);

  const pick = useCallback((picked: PickedFile | null) => {
    if (!picked) return;
    const validationError = validatePickedFile(picked, rules);
    if (validationError) {
      setError(validationError);
      setStatus('error');
      setFile(null);
      return;
    }
    setFile(picked);
    setError(null);
    setStatus('picked');
    setProgress(null);
  }, [rules]);

  const runUpload = useCallback(async (targetFile: PickedFile, uploadFn: UploadFn<T>): Promise<T | undefined> => {
    uploadFnRef.current = uploadFn;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('uploading');
    setProgress(0);
    setError(null);
    try {
      const result = await uploadFn(targetFile, {
        onProgress: (pct) => setProgress(pct),
        signal: controller.signal,
      });
      setStatus('success');
      setProgress(100);
      return result;
    } catch (err: any) {
      if (controller.signal.aborted) {
        setStatus('cancelled');
        setError(null);
      } else {
        setStatus('error');
        setError(getErrorMessage(err, 'Upload failed.'));
      }
      return undefined;
    } finally {
      abortRef.current = null;
    }
  }, []);

  const upload = useCallback((uploadFn: UploadFn<T>) => {
    if (!file) return Promise.resolve(undefined);
    return runUpload(file, uploadFn);
  }, [file, runUpload]);

  const retry = useCallback(() => {
    if (!file || !uploadFnRef.current) return Promise.resolve(undefined);
    return runUpload(file, uploadFnRef.current);
  }, [file, runUpload]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setFile(null);
    setStatus('idle');
    setProgress(null);
    setError(null);
  }, []);

  return { file, status, progress, error, pick, upload, retry, cancel, reset };
}
