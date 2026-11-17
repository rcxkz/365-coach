/**
 * Builds the demo person locally: `DEMO_MODE=1 npm run demo`.
 * Erases the local database first (refuses unless DEMO_MODE=1 and no
 * APP_PASSCODE). The demo deployment rebuilds itself each morning.
 */
import { buildDemo } from "../src/ai/demo";

buildDemo().then(
  () => {
    console.log("Demo person built.");
    process.exit(0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
