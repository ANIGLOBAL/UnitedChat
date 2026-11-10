import { createContext } from "react-router";

import type { AppEnv } from "./env";

export const envContext = createContext<AppEnv>();
