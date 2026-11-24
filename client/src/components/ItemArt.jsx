import React, { useState } from 'react';
import { itemTileStyle } from '../utils/itemStyle';

// Item imagery: the photo when there is one; otherwise a designed tile (category colour + icon), so a
// catalogue without photos still looks crafted instead of a grid of grey boxes.

/** Item visual. `src` is the resolved photo URL (or empty). */
export function ItemArt({ item, src, className = '', iconClassName = 'w-9 h-9' }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
        <img
          src={src}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  const { palette, Icon } = itemTileStyle(item);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${palette} flex items-center justify-center ${className}`} aria-hidden="true">
      <span className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/30" />
      <span className="absolute -bottom-8 -left-4 w-16 h-16 rounded-full bg-white/20" />
      <Icon className={`relative ${iconClassName} opacity-80`} strokeWidth={1.75} />
    </div>
  );
}
