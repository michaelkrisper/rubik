import { detectInSource, imageSource } from './detect.js';

onmessage = ({ data: { id, img, maxSide } }) => {
  const r = detectInSource(imageSource(img), maxSide);
  postMessage({
    id,
    result: {
      ok: r.ok,
      error: r.error,
      clockwise: r.clockwise,
      junction: r.junction,
      cell: r.cell,
      faces: r.faces.map(({ corners, center, cellPts, cells, J, uWith, vWith, found }) => ({ corners, center, cellPts, cells, J, uWith, vWith, found })),
    },
  });
};
