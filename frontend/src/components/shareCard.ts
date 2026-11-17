import type { Film } from '../types/phimai';
import { CAT_LABEL, getKVTubeWatchUrl, getThumbUrl } from '../utils/phimaiUtils';

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Paints the 1080×1920 Story share card for a film onto the given canvas. */
export async function drawShareCard(canvas: HTMLCanvasElement, film: Film): Promise<boolean> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  ctx.fillStyle = '#0d0e14';
  ctx.fillRect(0, 0, 1080, 1920);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  const loaded = await new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = getThumbUrl(film.id);
  });

  if (loaded) {
    try {
      const scale = Math.max(1080 / img.width, 640 / img.height);
      const sw = 1080 / scale;
      const sh = 640 / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1080, 640);
    } catch {
      ctx.fillStyle = '#161822';
      ctx.fillRect(0, 0, 1080, 640);
    }
  } else {
    ctx.fillStyle = '#161822';
    ctx.fillRect(0, 0, 1080, 640);
  }

  ctx.fillStyle = '#ffd875';
  ctx.fillRect(64, 690, 140, 8);

  ctx.fillStyle = '#ffd875';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(`#${film.rank} • ${CAT_LABEL[film.cat] || 'Phim AI'}`, 64, 770);

  ctx.fillStyle = '#f4f4f6';
  ctx.font = 'bold 60px sans-serif';
  let y = 865;
  wrapLines(ctx, film.title || '', 950)
    .slice(0, 3)
    .forEach((ln) => {
      ctx.fillText(ln, 64, y);
      y += 78;
    });

  ctx.fillStyle = '#b4b8c8';
  ctx.font = '38px sans-serif';
  y += 24;
  wrapLines(ctx, film.blurb || '', 950)
    .slice(0, 3)
    .forEach((ln) => {
      ctx.fillText(ln, 64, y);
      y += 54;
    });

  y += 40;
  ctx.fillStyle = '#161822';
  ctx.fillRect(64, y, 952, 190);
  ctx.strokeStyle = 'rgba(255, 216, 117, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(64, y, 952, 190);

  ctx.fillStyle = '#ffd875';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText(`Công nghệ AI: ${film.tool || 'AI Studio'}`, 100, y + 75);

  ctx.fillStyle = '#f4f4f6';
  ctx.font = '34px sans-serif';
  ctx.fillText(`Kênh: ${film.channel || 'KV-PhimAI'} • Thời lượng: ${film.dur || 'HD'}`, 100, y + 138);

  ctx.fillStyle = '#ffd875';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('KV-PhimAI • u.khoavo.vndns.net', 64, 1740);

  ctx.fillStyle = '#b4b8c8';
  ctx.font = '32px monospace';
  ctx.fillText(getKVTubeWatchUrl(film.id), 64, 1805);

  return true;
}
