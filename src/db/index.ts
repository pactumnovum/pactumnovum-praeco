import type { Config } from "../config.ts";
import { openD1 } from "./d1.ts";
import { openLocalDb } from "./local.ts";
import type { Db } from "./types.ts";

export type { Db, Param, Row, RunResult } from "./types.ts";

export function openDb(config: Config): Db {
  return config.d1 ? openD1(config.d1) : openLocalDb(config.localDbPath);
}
