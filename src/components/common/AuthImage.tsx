import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { photoObjectUrl } from '../../api/client';

/** <img> for private server photos (they need the Authorization header, so a plain src cannot work). */
export function AuthImage({ src, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [url, setUrl] = useState<string | null>(src.startsWith('/api/') ? null : src);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!src.startsWith('/api/')) {
      setUrl(src);
      return;
    }
    let live = true;
    setFailed(false);
    photoObjectUrl(src).then((u) => live && setUrl(u)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [src]);
  if (failed) return <div className="bg-[#F1F5F9] text-[#475569] text-[10px] flex items-center justify-center w-full h-full">Photo unavailable</div>;
  if (!url) return <div className="bg-[#F1F5F9] animate-pulse w-full h-full" aria-label="Loading photo" />;
  return <img src={url} alt={alt} {...rest} />;
}
