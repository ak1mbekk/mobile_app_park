import { useCallback, useState } from 'react';

const LS_KEY = 'mapmodule.mapImage';

export function useMapImage() {
  const [image, setImageState] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) || '';
    } catch {
      return '';
    }
  });

  const setImage = useCallback((src: string) => {
    const val = src || '';
    setImageState(val);
    try {
      if (val) localStorage.setItem(LS_KEY, val);
      else localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore quota/SSO errors */
    }
  }, []);

  const clearImage = useCallback(() => setImage(''), [setImage]);

  const setFromFile = useCallback(
    (file: File) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [setImage]
  );

  return { image, setImage, clearImage, setFromFile };
}
