import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from './store';

export default function BrandLogo({ placement = 'header' }) {
  const { brand } = useStore();
  const src = brand?.[placement];
  const [failed, setFailed] = useState(null);
  const useImage = !!src && failed !== src;
  const base = placement === 'header' ? 'wordmark' : 'footer-logo';
  return (
    <Link to="/" aria-label="MAYGREY home" className={`${base}${useImage ? ` ${base}--image` : ''}`}>
      {useImage ? (
        <img src={src} alt={placement === 'footer' ? 'MAYGREY — SOMEWHERE BETWEEN.' : 'MAYGREY'} onError={() => setFailed(src)} />
      ) : <>MAYGREY<span>®</span></>}
    </Link>
  );
}
