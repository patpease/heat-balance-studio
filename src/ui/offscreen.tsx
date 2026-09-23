import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

/**
 * Render a figure off screen, at a desk's width, for as long as `use` needs it.
 *
 * The export's job on a phone. The live chart there is the compact layout and
 * the live section carries numbered markers, and neither is the figure anyone
 * should receive: an exported image outlives the page, and the same project
 * must export the same picture from any device. So the export mounts a copy in
 * a box `width` wide, where `useWidth` measures a desk and the standard layout
 * renders, and shoots that instead.
 *
 * `flushSync` is what makes this synchronous: the render commits, the layout
 * effect measures the box, and the re-render at the measured width lands, all
 * before `use` is called.
 *
 * The box is in the document (a detached node measures 0) but off screen and
 * hidden, and it is removed however `use` ends.
 */
export async function withOffscreen<T>(
  element: ReactElement,
  width: number,
  use: (host: HTMLElement) => Promise<T>,
): Promise<T> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(element));
    return await use(host);
  } finally {
    root.unmount();
    host.remove();
  }
}
