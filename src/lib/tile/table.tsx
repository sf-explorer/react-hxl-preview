import { useMemo, useState } from "react"
import type { TileComponentProps } from "./types"

interface ColumnType {
  type?: string
  urlKey?: string
  format?: string
  currencyCode?: string
  minimumFractionDigits?: number
}

interface Column {
  key: string
  header: string
  align?: "left" | "right" | "center"
  isSortable?: boolean
  isFilterable?: boolean
  columnType?: ColumnType
}

type Row = Record<string, unknown>

function formatNumber(value: unknown, type: ColumnType): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value == null ? "" : String(value)
  if (type.format === "currency") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: type.currencyCode || "USD",
      minimumFractionDigits: type.minimumFractionDigits ?? 0,
    }).format(n)
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: type.minimumFractionDigits ?? 0,
  }).format(n)
}

function renderCell(row: Row, col: Column) {
  const raw = row[col.key]
  const ct = col.columnType
  if (ct?.type === "link") {
    const href = ct.urlKey ? row[ct.urlKey] : undefined
    const text = raw == null ? "" : String(raw)
    if (typeof href === "string" && href) {
      return (
        <a className="tile-link" href={href} target="_blank" rel="noreferrer">
          {text}
        </a>
      )
    }
    return text
  }
  if (ct?.type === "number") return formatNumber(raw, ct)
  return raw == null ? "" : String(raw)
}

function compareRows(a: Row, b: Row, key: string, dir: "asc" | "desc"): number {
  const av = a[key]
  const bv = b[key]
  let cmp: number
  if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv
  } else {
    cmp = String(av ?? "").localeCompare(String(bv ?? ""))
  }
  return dir === "asc" ? cmp : -cmp
}

export function TileTable({ attributes }: TileComponentProps) {
  const columns: Column[] = Array.isArray(attributes.columns)
    ? attributes.columns
    : []
  const rows: Row[] = Array.isArray(attributes.rows) ? attributes.rows : []
  const striped = attributes.appearance === "striped"
  const sticky = !!attributes.isStickyHeader
  const pageSize: number | undefined = attributes.pagination?.pageSize
  const filterable = columns.some((c) => c.isFilterable)

  const initialSort = attributes.sort as
    | { key: string; direction?: "asc" | "desc" }
    | undefined
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ? { key: initialSort.key, dir: initialSort.direction ?? "asc" } : null,
  )
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(0)

  const processed = useMemo(() => {
    let out = rows
    if (filter.trim()) {
      const needle = filter.toLowerCase()
      const keys = columns.filter((c) => c.isFilterable).map((c) => c.key)
      out = out.filter((row) =>
        keys.some((k) => String(row[k] ?? "").toLowerCase().includes(needle)),
      )
    }
    if (sort) {
      out = [...out].sort((a, b) => compareRows(a, b, sort.key, sort.dir))
    }
    return out
  }, [rows, columns, filter, sort])

  const total = processed.length
  const pageCount = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const current = Math.min(page, pageCount - 1)
  const visible = pageSize
    ? processed.slice(current * pageSize, current * pageSize + pageSize)
    : processed

  function toggleSort(col: Column) {
    if (!col.isSortable) return
    setPage(0)
    setSort((prev) =>
      prev && prev.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "asc" },
    )
  }

  return (
    <div className="tile-table-wrap">
      {filterable && (
        <input
          className="tile-table-filter"
          type="search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(0)
          }}
        />
      )}
      <table
        className={`tile-table${striped ? " tile-table--striped" : ""}${sticky ? " tile-table--sticky" : ""}`}
      >
        {attributes.caption && (
          <caption className="tile-table-caption">{String(attributes.caption)}</caption>
        )}
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key
              return (
                <th
                  key={col.key}
                  className={col.align === "right" ? "align-right" : undefined}
                  aria-sort={
                    active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  {col.isSortable ? (
                    <button type="button" className="tile-table-sort" onClick={() => toggleSort(col)}>
                      {col.header}
                      <span className="tile-table-arrow">
                        {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td className="tile-table-empty" colSpan={Math.max(1, columns.length)}>
                No records
              </td>
            </tr>
          ) : (
            visible.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className={col.align === "right" ? "align-right" : undefined}>
                    {renderCell(row, col)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {pageSize && total > pageSize && (
        <div className="tile-table-pager">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Prev
          </button>
          <span>
            {current * pageSize + 1}–{Math.min(total, (current + 1) * pageSize)} of {total}
          </span>
          <button
            type="button"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
