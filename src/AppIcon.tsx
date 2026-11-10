import { useEffect, useRef, useState } from "react";
import { AppWindow } from "lucide-react";
import { api } from "./api";

export default function AppIcon({ path, bundleId, name, active }: { path?: string; bundleId: string; name: string; active: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    setImage(null);
    if (!active || !path || !element.current) return;
    let cancelled = false;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void api.appIcon(path, bundleId).then(value => {
        if (!cancelled && value?.startsWith("data:image/png;base64,")) setImage(value);
      }).catch(() => {});
    });
    observer.observe(element.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [path, bundleId, active]);
  return <span className="residue-app-icon" ref={element} aria-hidden="true" title={name}>{image ? <img src={image} alt="" onError={() => setImage(null)} /> : <AppWindow size={20} strokeWidth={1.5} />}</span>;
}
