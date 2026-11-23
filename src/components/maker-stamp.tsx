import pkg from "../../package.json";
import { BRAND, showMakerStamp } from "@/theme/brand";

/** The maker's stamp and version (see src/theme/brand.ts). */
export function MakerStamp() {
  if (!showMakerStamp()) return null;
  const [major, minor] = pkg.version.split(".");
  return (
    <p className="flex items-center justify-between border-t border-foreground py-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      <span>
        <span className="text-highlight">●</span> {BRAND.stamp}
      </span>
      <span className="figure">
        v{major}.{minor}
      </span>
    </p>
  );
}
