import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// The dashboard builds a CSV Blob and clicks a download link; on the phone the
// same CSV text is written to the cache and handed to the share sheet.
export const csvCell = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function shareCsv(fileName: string, rows: string[]) {
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, rows.join('\n'), { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
}
