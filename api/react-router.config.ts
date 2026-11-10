import type { Config } from "@react-router/dev/config";

export default {
  // ssr: true for now; ChatIndex v2.0 UI is server-rendered with the
  // foundation page and will evolve during later phases.
  ssr: true,
} satisfies Config;
