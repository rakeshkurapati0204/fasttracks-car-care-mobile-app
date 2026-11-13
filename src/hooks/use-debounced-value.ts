import { useEffect, useState } from 'react';

/** `value`, but only after it has stopped changing for `ms`: a search box sends one request when the person pauses typing, not one per key. */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
