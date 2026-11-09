import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function ApiErrorNotice() {
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener('zohra-api-error', show);
    return () => window.removeEventListener('zohra-api-error', show);
  }, []);
  useEffect(() => setVisible(false), [location.pathname]);
  if (!visible) return null;
  return <div role="alert" className="fixed top-16 left-4 right-4 z-50 rounded border border-red-400 bg-red-950 p-3 text-white flex justify-between gap-4">
    <span>The request failed. Please try again.</span>
    <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss request error">Dismiss</button>
  </div>;
}
