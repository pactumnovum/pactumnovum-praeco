// Open statistical APIs. Each response becomes one dataset item whose body lists
// one value per line, so every number can later be checked verbatim.

export interface DatasetRow {
  label: string;
  area: string;
  period: string;
  value: string;
}

export interface ParsedDataset {
  title: string;
  updated: string | null;
  rows: DatasetRow[];
}

const LINE_SEP = " | ";

export function rowsToBody(rows: DatasetRow[]): string {
  return rows.map((r) => [r.label, r.area, r.period, r.value].join(LINE_SEP)).join("\n");
}

export function bodyToRows(body: string): DatasetRow[] {
  return body
    .split("\n")
    .map((line) => line.split(LINE_SEP))
    .filter((p) => p.length === 4)
    .map(([label, area, period, value]) => ({ label: label!, area: area!, period: period!, value: value! }));
}

/** Numbers as they appear in the JSON, without reformatting. */
function raw(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

/** World Bank API v2: [meta, rows]. */
export function parseWorldBank(json: unknown): ParsedDataset {
  if (!Array.isArray(json) || json.length < 2) throw new Error("unexpected World Bank response");
  const meta = json[0] as { lastupdated?: string };
  const data = (json[1] ?? []) as {
    indicator?: { value?: string };
    country?: { value?: string };
    date?: string;
    value?: unknown;
  }[];
  const rows: DatasetRow[] = [];
  let title = "";
  for (const d of data) {
    const value = raw(d.value);
    if (value === null || !d.country?.value || !d.date) continue;
    title ||= d.indicator?.value ?? "";
    rows.push({ label: d.indicator?.value ?? "", area: d.country.value, period: d.date, value });
  }
  return { title, updated: meta.lastupdated ?? null, rows };
}

interface JsonStatDimension {
  label?: string;
  category?: { index?: Record<string, number> | string[]; label?: Record<string, string> };
}

/** Eurostat dissemination API, JSON-stat 2.0. */
export function parseJsonStat(json: unknown): ParsedDataset {
  const ds = json as {
    label?: string;
    updated?: string;
    id?: string[];
    size?: number[];
    value?: Record<string, number | null> | (number | null)[];
    dimension?: Record<string, JsonStatDimension>;
  };
  if (!ds.id || !ds.size || !ds.dimension || !ds.value) throw new Error("unexpected JSON-stat response");
  const ids = ds.id;
  const sizes = ds.size;
  const codesByDim = ids.map((id) => {
    const index = ds.dimension![id]?.category?.index ?? {};
    const codes: string[] = [];
    if (Array.isArray(index)) index.forEach((c, i) => (codes[i] = c));
    else for (const [code, i] of Object.entries(index)) codes[i] = code;
    return codes;
  });
  const labelOf = (dim: string, code: string) => ds.dimension![dim]?.category?.label?.[code] ?? code;

  const rows: DatasetRow[] = [];
  const entries = Array.isArray(ds.value)
    ? ds.value.map((v, i) => [String(i), v] as const)
    : Object.entries(ds.value);
  for (const [key, v] of entries) {
    const value = raw(v);
    if (value === null) continue;
    let rest = Number(key);
    const coords: string[] = new Array(ids.length);
    for (let d = ids.length - 1; d >= 0; d--) {
      const size = sizes[d] ?? 1;
      coords[d] = codesByDim[d]?.[rest % size] ?? "";
      rest = Math.floor(rest / size);
    }
    const geoAt = ids.indexOf("geo");
    const timeAt = ids.indexOf("time");
    const extra = ids
      .map((id, d) => (d !== geoAt && d !== timeAt && (sizes[d] ?? 1) > 1 ? labelOf(id, coords[d]!) : null))
      .filter(Boolean)
      .join(", ");
    rows.push({
      label: extra ? `${ds.label ?? ""} (${extra})` : (ds.label ?? ""),
      area: geoAt >= 0 ? labelOf("geo", coords[geoAt]!) : "",
      period: timeAt >= 0 ? coords[timeAt]! : "",
      value,
    });
  }
  return { title: ds.label ?? "", updated: ds.updated ?? null, rows };
}

/** IMF DataMapper API: {values: {INDICATOR: {AREA: {YEAR: value}}}}. Most recent year per area. */
export function parseImfDataMapper(json: unknown, label: string): ParsedDataset {
  const values = (json as { values?: Record<string, Record<string, Record<string, unknown>>> }).values ?? {};
  const rows: DatasetRow[] = [];
  for (const byArea of Object.values(values)) {
    for (const [area, byYear] of Object.entries(byArea)) {
      const years = Object.keys(byYear).sort();
      const year = years[years.length - 1];
      const value = year ? raw(byYear[year]) : null;
      if (year && value !== null) rows.push({ label, area, period: year, value });
    }
  }
  return { title: label, updated: null, rows };
}
