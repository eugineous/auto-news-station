import { useEffect, useState } from "react";

export function useCockpitFetch<T>(url: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    let mounted = true;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (mounted) setData(json as T);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [url]);
  return data;
}
