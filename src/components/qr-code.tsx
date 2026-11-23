import QRCode from "qrcode";

/**
 * A QR code drawn as plain SVG squares in the current text colour, so it
 * follows the theme without a colour of its own.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const size = modules.size;
  const quiet = 2;
  const cells: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules.get(x, y)) cells.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  const box = size + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${box} ${box}`}
      shapeRendering="crispEdges"
      className="block h-full w-full"
    >
      <path d={cells.join("")} fill="currentColor" />
    </svg>
  );
}
