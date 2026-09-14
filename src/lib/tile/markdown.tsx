import { Fragment, type ReactNode } from "react"

/**
 * A deliberately tiny Markdown renderer: paragraphs plus `**bold**` inline
 * emphasis. It builds React nodes directly (no `dangerouslySetInnerHTML`), so
 * there is no HTML-injection surface. Anything it does not understand renders
 * as plain text.
 */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part)
    return bold ? <strong key={i}>{bold[1]}</strong> : <Fragment key={i}>{part}</Fragment>
  })
}

export function TileMarkdown({ source }: { source?: unknown }) {
  const text = source == null ? "" : String(source)
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim() !== "")
  return (
    <div className="tile-markdown">
      {paragraphs.map((p, i) => (
        <p key={i}>{renderInline(p)}</p>
      ))}
    </div>
  )
}
