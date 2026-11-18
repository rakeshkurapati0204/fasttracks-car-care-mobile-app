// What to tell a person when a file download (the customers CSV) fails. Pure, so `npm test` can run it. The old message was one fixed line for every failure
// ("CSV download failed. Please try again."), so nobody could tell a refused account from a server error from no internet.

export type DownloadErrorLike = { status?: number; message?: string; response?: { status?: number } } | null | undefined;

/** The HTTP status carried by the error, when the server answered at all. */
export function downloadStatus(err: DownloadErrorLike): number | null {
  const s = err?.status ?? err?.response?.status;
  return typeof s === 'number' && s > 0 ? s : null;
}

/** A sentence for the person; `what` is the thing being downloaded ("The CSV"). */
export function downloadFailureText(err: DownloadErrorLike, what = 'The file'): string {
  const status = downloadStatus(err);
  if (status === 401) return 'Your session has ended. Sign in again and retry.';
  if (status === 403) return `Your account is not allowed to download this. ${what} is for the owner, store manager, HR and cashier.`;
  if (status === 404) return 'This server does not have the download yet. Ask your admin to update it.';
  if (status === 413 || status === 504 || status === 408) return `${what} is too big to build in one go. Pick a shorter date range and try again.`;
  if (status !== null && status >= 500) return `The server could not build ${what.toLowerCase()} (error ${status}). Try a shorter date range, or try again in a minute.`;
  if (status !== null) return `${what} could not be downloaded (error ${status}).`;
  // No answer at all: the phone is offline, the server is down, or the connection dropped half way.
  return 'Could not reach the server. Check your internet connection and try again.';
}
