export function shouldStopStream(signal, stopRequested) {
  return stopRequested || Boolean(signal?.aborted);
}
