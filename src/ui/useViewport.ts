import { useState, useEffect } from "react";

export interface Viewport {
  rows: number;
  columns: number;
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => ({
    rows: process.stdout.rows || 24,
    columns: process.stdout.columns || 80,
  }));

  useEffect(() => {
    const onResize = () =>
      setVp({
        rows: process.stdout.rows || 24,
        columns: process.stdout.columns || 80,
      });
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  return vp;
}
