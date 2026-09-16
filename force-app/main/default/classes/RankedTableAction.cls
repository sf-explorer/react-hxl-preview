/**
 * RankedTableAction
 * HXL invocable action: a GENERIC, caller-driven ranked/prioritized table for the rankedTableCard widget.
 *
 * The widget is "only the UI" -- it renders whatever columns + rows the caller (an Agentforce/MCP
 * planner) provides. This action is the interface: the agent supplies a single JSON `spec` describing
 * the header (title/subtitle/badges), an optional summary callout, the table (columns + rows, where
 * each row is keyed by the column keys), optional highlights, and an optional CTA. The action
 * FLATTENS the keyed rows into the render-time payload the widget consumes: each row becomes a set
 * of FIXED positional cell scalars (c1..c6, each with a cNShow / cNAlign sibling) in COLUMN ORDER,
 * plus a mirrored cells[] list. Columns are capped at 6 (a card is too narrow for more).
 *
 * Why flatten in Apex rather than in the widget: Apex @InvocableVariable cannot express a
 * dynamic-keyed row (a Map), and a native tile/table bound to arbitrary keys cannot be produced from
 * a typed CLT. Flattening keeps the widget's binding surface to plain `forEach` + `meta.if <boolean>`
 * only -- no operators, no dynamic key access. Crucially the widget binds the row cells as FIXED
 * positional scalars ({!$row.c1}...), NOT as a nested forEach over the row's own cells[]: the live
 * HXL runtime does not resolve a forEach over a property of the outer loop item (single-level loops
 * over a top-level $attrs list work; a loop over {!$row.cells} renders empty), so positional scalars
 * are what make the table render identically in the local preview and the production HXL runtime.
 * (See hxl-widget-build live-validator-deltas Delta 8. Same flatten rationale as ActionPlanAction.)
 *
 * Binding anchor: the single @InvocableVariable field `table` (RankedTableResponse.table) must stay
 * byte-identical across the payload CLT (rankedTableCardOutputValues), the GenAiFunction output, and
 * the wrapper renderer path ({!$attrs.outputValues.table.<field>}). The RankedTable field NAMES
 * (title / subtitle / badges / columns / rows / ...) match the widget attributes so the Agentforce
 * (agent) renderer binds them flat as {!$attrs.title} etc.
 *
 * Input is a REAL, typed Request (not a single JSON blob): the statically-shaped parts are strongly
 * typed @InvocableVariable fields, and only the one irreducibly free-form part — the per-row cell
 * values — is a JSON string. Concretely:
 *   title        String  — card title
 *   description  String  — subtitle under the title (context: who / where / when)
 *   summary      String  — the single key takeaway, rendered as a callout
 *   columns      List<ColumnInput>  — TYPED {header, align[start|end|center], key(optional)}, left→right
 *   records      String  — JSON array of ROWS, each row a list of display values in COLUMN ORDER:
 *                          [ ["Multirisque PME Delaunay", "42 000 €", "Négociation"], ... ]
 *                          (a row may also be {"id":"…","values":[…]}, or a key→value object keyed by
 *                          column.key — all three shapes are accepted)
 *   badges       List<Badge>      — TYPED {label, variant[primary|success|warning|danger|neutral]}
 *   highlights   List<Highlight>  — TYPED {iconName, iconColor, title, detail}
 *   ctaLabel / ctaUrl  String
 * Why records is a String and not List<SObject> or a typed List: the values are agent-composed DISPLAY
 * text (formatted amounts, computed scores), not fields of one SObject, and @InvocableVariable has no
 * Map type, so an arbitrary-keyed row cannot be a typed field. Keeping columns typed (that is where the
 * align enum lives) while the free-form row values ride in one string is the maximal-typing shape.
 * The first column is emphasized (semibold); a right-aligned column ("align":"end") suits numeric/amount
 * columns. Called with no args -> a neutral empty placeholder (this action holds no business data).
 * Back-compat: the legacy single `spec` JSON string is still accepted (parsed as a whole object) when
 * no typed field is supplied, so the currently-deployed Agentforce binding keeps working.
 */
global with sharing class RankedTableAction {

    // Fixed number of positional cell slots the widget renders per row (c1..cMAX_COLS). Extra
    // columns in the spec are dropped — a card is too narrow to show more.
    private static final Integer MAX_COLS = 6;

    // ---- Invocable input (typed) ----
    global class Request {
        @InvocableVariable(label='Title' description='Card title.' required=false)
        global String title;
        @InvocableVariable(label='Description' description='Subtitle under the title (context: who / where / when).' required=false)
        global String description;
        @InvocableVariable(label='Summary' description='The single most important takeaway; rendered as a callout.' required=false)
        global String summary;
        @InvocableVariable(label='Columns' description='The columns to show, left to right: each is {header, align, key(optional)}. align MUST be one of: start | end | center (use "end" for numeric/amount columns). At most 6 (extras are dropped — a card is too narrow). Row values in "records" align to these positionally.' required=false)
        global List<ColumnInput> columns;
        @InvocableVariable(label='Records (JSON rows)' description='JSON array of rows. Each row is a list of display values in COLUMN ORDER, e.g. [["Multirisque PME Delaunay","42 000 €","Négociation"],["Flotte Vidal","31 000 €","Proposition"]]. A row may also be {"id":"…","values":[…]} or an object keyed by the column keys. Pass the rows you already have; the action lays each value under its column.' required=false)
        global String records;
        @InvocableVariable(label='Badges' description='Optional header badges: each {label, variant}. variant MUST be one of: primary | success | warning | danger | neutral (NOT "info"/"critical" or a CSS color).' required=false)
        global List<Badge> badges;
        @InvocableVariable(label='Highlights' description='Optional per-item callouts: each {iconName, iconColor, title, detail}. iconColor MUST be one of: success | warning | danger | default. iconName is a Lucide slug (e.g. trending-up, clock, bell), NOT an SLDS name.' required=false)
        global List<Highlight> highlights;
        @InvocableVariable(label='CTA Label' description='Optional CTA button label.' required=false)
        global String ctaLabel;
        @InvocableVariable(label='CTA URL' description='Optional CTA button href.' required=false)
        global String ctaUrl;
        @InvocableVariable(label='Spec (JSON, legacy)' description='LEGACY: a single JSON object carrying all of the above fields (title/description/summary/columns/records/badges/highlights/cta). Used only when no typed field is supplied, for back-compat with callers that still send one JSON string. Prefer the typed fields.' required=false)
        global String spec;
    }

    // ---- Typed column definition (the part with a real enum: align) ----
    global class ColumnInput {
        @InvocableVariable(label='Header' description='Column header label.')
        global String header;
        @InvocableVariable(label='Align' description='start | end | center (use end for numeric/amount columns). Defaults to start.')
        global String align;
        @InvocableVariable(label='Key' description='Optional field key (latent; used only when a record row is a key→value object rather than a values list).')
        global String key;
    }

    // ---- Invocable response wrapper (binding anchor: table) ----
    global class RankedTableResponse {
        @InvocableVariable(label='Table' description='The flattened ranked-table payload rendered by the rankedTableCard widget. Binding anchor: this field name is byte-identical across the payload CLT, the GenAiFunction output, and the wrapper renderer path.')
        global RankedTable table;
    }

    // ---- Render-time payload the widget consumes ----
    global class RankedTable {
        @InvocableVariable(label='Title' description='Card title.')
        global String title;
        @InvocableVariable(label='Subtitle' description='Secondary line under the title (context: who / where / when).')
        global String subtitle;
        @InvocableVariable(label='Badges' description='Header badges (label + variant) for at-a-glance counts.')
        global List<Badge> badges;
        @InvocableVariable(label='Show Summary' description='Toggle for the summary callout; derived from content when omitted.')
        global Boolean showSummary;
        @InvocableVariable(label='Summary Title' description='Summary callout title — the single most important takeaway.')
        global String summaryTitle;
        @InvocableVariable(label='Summary Detail' description='Summary callout body.')
        global String summaryDetail;
        @InvocableVariable(label='Table Caption' description='Caption above the table.')
        global String tableCaption;
        @InvocableVariable(label='Columns' description='Column headers, rendered left to right; each row cell aligns to these positionally.')
        global List<ColumnVM> columns;
        @InvocableVariable(label='Rows' description='Flattened rows: each row has an id and one cell per column, in column order.')
        global List<RowVM> rows;
        @InvocableVariable(label='Show Highlights' description='Toggle for the highlights section; derived from content when omitted.')
        global Boolean showHighlights;
        @InvocableVariable(label='Highlights Caption' description='Caption above the highlights list.')
        global String highlightsCaption;
        @InvocableVariable(label='Highlights' description='Per-item callout rows (icon + title + detail).')
        global List<Highlight> highlights;
        @InvocableVariable(label='Show CTA' description='Toggle for the CTA button; derived from ctaLabel when omitted.')
        global Boolean showCta;
        @InvocableVariable(label='CTA Label' description='CTA button label.')
        global String ctaLabel;
        @InvocableVariable(label='CTA URL' description='CTA button href.')
        global String ctaUrl;
    }

    global class Badge {
        @InvocableVariable(label='Label' description='Badge text.')
        global String label;
        @InvocableVariable(label='Variant' description='Color token. MUST be EXACTLY one of: primary | success | warning | danger | neutral. Do NOT use "info"/"critical" or a CSS color like "blue"/"green"; any unlisted value renders as a plain grey badge.')
        global String variant;
    }

    global class ColumnVM {
        @InvocableVariable(label='Key' description='Column key (latent; matches the record field keys the value is looked up by).')
        global String key;
        @InvocableVariable(label='Header' description='Column header label.')
        global String header;
        @InvocableVariable(label='Align' description='start | end | center (use end for numeric/amount columns).')
        global String align;
    }

    // A flattened row. The widget binds the cells as FIXED positional scalars (c1..c6, each with a
    // matching cNShow / cNAlign) rather than a nested cells[] list: the live HXL runtime does not
    // resolve a forEach over a property of the outer loop item (see live-validator-deltas Delta 8),
    // so the render path reads only plain scalar members of the row. cells[] is retained (schema is
    // append-only, Delta 6) and mirrors the same values for any consumer that wants the list shape.
    global class RowVM {
        @InvocableVariable(label='Id' description='Row id.')
        global String id;
        @InvocableVariable(label='Cells' description='One cell per column, in column order (list mirror of c1..c6).')
        global List<CellVM> cells;

        @InvocableVariable(label='Cell 1' description='Value of column 1.') global String c1;
        @InvocableVariable(label='Cell 1 Show' description='Whether column 1 exists.') global Boolean c1Show;
        @InvocableVariable(label='Cell 1 Align' description='start | end | center for column 1.') global String c1Align;
        @InvocableVariable(label='Cell 2' description='Value of column 2.') global String c2;
        @InvocableVariable(label='Cell 2 Show' description='Whether column 2 exists.') global Boolean c2Show;
        @InvocableVariable(label='Cell 2 Align' description='start | end | center for column 2.') global String c2Align;
        @InvocableVariable(label='Cell 3' description='Value of column 3.') global String c3;
        @InvocableVariable(label='Cell 3 Show' description='Whether column 3 exists.') global Boolean c3Show;
        @InvocableVariable(label='Cell 3 Align' description='start | end | center for column 3.') global String c3Align;
        @InvocableVariable(label='Cell 4' description='Value of column 4.') global String c4;
        @InvocableVariable(label='Cell 4 Show' description='Whether column 4 exists.') global Boolean c4Show;
        @InvocableVariable(label='Cell 4 Align' description='start | end | center for column 4.') global String c4Align;
        @InvocableVariable(label='Cell 5' description='Value of column 5.') global String c5;
        @InvocableVariable(label='Cell 5 Show' description='Whether column 5 exists.') global Boolean c5Show;
        @InvocableVariable(label='Cell 5 Align' description='start | end | center for column 5.') global String c5Align;
        @InvocableVariable(label='Cell 6' description='Value of column 6.') global String c6;
        @InvocableVariable(label='Cell 6 Show' description='Whether column 6 exists.') global Boolean c6Show;
        @InvocableVariable(label='Cell 6 Align' description='start | end | center for column 6.') global String c6Align;
    }

    // One flattened cell, positioned to align with its column.
    global class CellVM {
        @InvocableVariable(label='Value' description='Display text for the cell.')
        global String value;
        @InvocableVariable(label='Align' description='start | end | center (copied from the column).')
        global String align;
        @InvocableVariable(label='Weight' description='regular | semibold | bold.')
        global String weight;
    }

    global class Highlight {
        @InvocableVariable(label='Icon Name' description='A LUCIDE icon slug (lucide.dev), NOT an SLDS name. Pick from: phone, mail, file-text, clipboard-list, calendar, clock, bell, user, users, building, credit-card, check-circle, activity, trending-up. Do NOT use SLDS names like "document"/"call"/"assessment". If unsure, omit it.')
        global String iconName;
        @InvocableVariable(label='Icon Color' description='Color token. MUST be EXACTLY one of: success | warning | danger | default. Do NOT use a CSS color like "blue"/"green"/"purple" — those render as the default grey.')
        global String iconColor;
        @InvocableVariable(label='Title' description='Highlight title.')
        global String title;
        @InvocableVariable(label='Detail' description='Highlight detail.')
        global String detail;
    }

    @InvocableMethod(label='Get Ranked Table' description='Renders a generic, caller-driven ranked/prioritized table in the rankedTableCard HXL widget. Pass typed columns (header + align) and a records JSON string of rows (values in column order), plus a summary, a description and optional badges, highlights and a CTA; the action lays each value under its column into the payload the user reads. Call with no input to render a neutral empty placeholder (the action holds no records of its own).')
    global static List<RankedTableResponse> getRankedTable(List<Request> requests) {
        Request req = (requests != null && !requests.isEmpty()) ? requests[0] : null;

        RankedTableResponse res = new RankedTableResponse();
        if (req != null && hasTypedInput(req)) {
            // Preferred path: a real, typed Request. Columns are typed; row values ride in a JSON string.
            res.table = buildFromTyped(req);
        } else if (req != null && String.isNotBlank(req.spec)) {
            // Legacy path: a single JSON `spec` object (kept for the currently-deployed Agentforce binding).
            Map<String, Object> parsed;
            try {
                parsed = (Map<String, Object>) JSON.deserializeUntyped(req.spec);
            } catch (Exception e) {
                // Malformed JSON -> render an empty, still-valid card rather than throwing at the planner.
                parsed = new Map<String, Object>{ 'title' => 'Invalid table spec', 'summaryTitle' => 'The provided JSON could not be parsed.', 'showSummary' => true };
            }
            res.table = build(parsed);
        } else {
            res.table = build(emptyState());
        }

        return new List<RankedTableResponse>{ res };
    }

    // True when any typed field carries content (so we prefer the typed path over the legacy `spec`).
    private static Boolean hasTypedInput(Request r) {
        return String.isNotBlank(r.title) || String.isNotBlank(r.description) || String.isNotBlank(r.summary)
            || String.isNotBlank(r.records) || String.isNotBlank(r.ctaLabel) || String.isNotBlank(r.ctaUrl)
            || (r.columns != null && !r.columns.isEmpty())
            || (r.badges != null && !r.badges.isEmpty())
            || (r.highlights != null && !r.highlights.isEmpty());
    }

    // Build the render-time payload from the typed Request: typed columns + the records JSON string.
    private static RankedTable buildFromTyped(Request r) {
        RankedTable t = new RankedTable();
        t.title        = r.title;
        t.subtitle     = r.description;   // `description` is the caller-friendly name for the subtitle
        t.summaryTitle = r.summary;       // the one-line takeaway, shown in the callout
        t.ctaLabel     = r.ctaLabel;
        t.ctaUrl       = r.ctaUrl;
        t.badges       = normalizeBadges(r.badges);
        t.highlights   = normalizeHighlights(r.highlights);

        // Typed columns -> ColumnVM (header + align; align defaults to start). Capped to MAX_COLS.
        t.columns = new List<ColumnVM>();
        if (r.columns != null) {
            for (ColumnInput ci : r.columns) {
                if (ci == null) continue;
                if (t.columns.size() >= MAX_COLS) break;
                ColumnVM c = new ColumnVM();
                c.key    = ci.key;
                c.header = firstNonBlank(ci.header, ci.key);
                c.align  = firstNonBlank(ci.align, 'start');
                t.columns.add(c);
            }
        }

        // Rows come from the `records` JSON string, laid out in column order (see buildRows()).
        t.rows = buildRows(parseRecords(r.records), t.columns);

        t.showSummary    = String.isNotBlank(t.summaryTitle) || String.isNotBlank(t.summaryDetail);
        t.showHighlights = t.highlights != null && !t.highlights.isEmpty();
        t.showCta        = String.isNotBlank(t.ctaLabel);
        return t;
    }

    // Parse the records JSON string into a list of raw row elements (each a List or Map). Lenient:
    // a blank or malformed string yields no rows (the header still renders).
    private static List<Object> parseRecords(String recordsJson) {
        if (String.isBlank(recordsJson)) return new List<Object>();
        try {
            Object parsed = JSON.deserializeUntyped(recordsJson);
            return (parsed instanceof List<Object>) ? (List<Object>) parsed : new List<Object>();
        } catch (Exception e) {
            return new List<Object>();
        }
    }

    // Flatten a parsed spec (columns + keyed rows) into the render-time payload (columns[] + rows[].cells[]).
    private static RankedTable build(Map<String, Object> spec) {
        RankedTable t = new RankedTable();
        t.title        = str(spec.get('title'));
        // `description` is the caller-friendly name for the subtitle; `summary` is the one-line
        // takeaway shown in the callout. Accept the render-payload field names (subtitle /
        // summaryTitle / summaryDetail) as back-compat aliases.
        t.subtitle     = firstNonBlank(str(spec.get('description')), str(spec.get('subtitle')));
        t.summaryTitle = firstNonBlank(str(spec.get('summary')), str(spec.get('summaryTitle')));
        t.summaryDetail= str(spec.get('summaryDetail'));
        t.tableCaption = str(spec.get('tableCaption'));
        t.highlightsCaption = str(spec.get('highlightsCaption'));
        t.ctaLabel     = str(spec.get('ctaLabel'));
        t.ctaUrl       = str(spec.get('ctaUrl'));

        t.badges = toBadges(spec.get('badges'));
        t.highlights = toHighlights(spec.get('highlights'));

        // Columns SELECT which record fields to show (by key) and their header/align. A column may
        // be a plain string (used as both key and header) or an object {key, header|label, align};
        // align defaults to start. Capped to MAX_COLS: a card is too narrow for more, and the widget
        // renders MAX_COLS fixed positional slots (see below).
        t.columns = new List<ColumnVM>();
        for (Object colObj : asList(spec.get('columns'))) {
            if (t.columns.size() >= MAX_COLS) break;
            ColumnVM c = new ColumnVM();
            if (colObj instanceof Map<String, Object>) {
                Map<String, Object> col = (Map<String, Object>) colObj;
                c.key    = str(col.get('key'));
                c.header = firstNonBlank(str(col.get('header')), str(col.get('label')));
                c.align  = firstNonBlank(str(col.get('align')), 'start');
            } else if (colObj != null) {
                c.key    = str(colObj);
                c.align  = 'start';
            } else {
                continue;
            }
            c.header = firstNonBlank(c.header, c.key);
            t.columns.add(c);
        }

        // Records (legacy shape): raw record objects keyed by column key. Accept `records` (preferred)
        // or `rows` (older alias). buildRows lays each value under its column.
        List<Object> records = asList(spec.get('records'));
        if (records.isEmpty()) records = asList(spec.get('rows'));
        t.rows = buildRows(records, t.columns);

        // Section toggles: honor an explicit boolean, else derive from content.
        t.showSummary    = boolOr(spec.get('showSummary'), String.isNotBlank(t.summaryTitle) || String.isNotBlank(t.summaryDetail));
        t.showHighlights = boolOr(spec.get('showHighlights'), t.highlights != null && !t.highlights.isEmpty());
        t.showCta        = boolOr(spec.get('showCta'), String.isNotBlank(t.ctaLabel));
        return t;
    }

    // ---- helpers ----

    // Turn raw row elements into flattened RowVMs, one cell per column in column order. A row element
    // may be: a List of values (values in column order); a Map with a "values" List (+ optional "id");
    // or a Map keyed by the column keys (legacy). The first column is emphasized. Each row is emitted
    // BOTH as a cells[] list (mirror) and as fixed positional scalars (c1..c6 + cNShow/cNAlign) — the
    // widget binds the scalars because the live runtime cannot resolve a forEach over the row's own
    // cells[] (see live-validator-deltas Delta 8).
    private static List<RowVM> buildRows(List<Object> rawRows, List<ColumnVM> cols) {
        List<RowVM> out = new List<RowVM>();
        Integer rowIndex = 0;
        for (Object rowObj : rawRows) {
            List<Object> values = null;   // positional values, in column order
            Map<String, Object> keyed = null;  // legacy: value looked up by column key
            String id = null;

            if (rowObj instanceof List<Object>) {
                values = (List<Object>) rowObj;
            } else if (rowObj instanceof Map<String, Object>) {
                Map<String, Object> m = (Map<String, Object>) rowObj;
                id = str(m.get('id'));
                if (m.get('values') instanceof List<Object>) {
                    values = (List<Object>) m.get('values');
                } else {
                    keyed = m;
                }
            } else {
                continue;
            }

            RowVM row = new RowVM();
            row.id = firstNonBlank(id, 'row' + rowIndex);
            rowIndex++;
            row.cells = new List<CellVM>();
            Integer colIndex = 0;
            for (ColumnVM c : cols) {
                CellVM cell = new CellVM();
                if (values != null) {
                    cell.value = (colIndex < values.size()) ? str(values[colIndex]) : null;
                } else {
                    cell.value = str(keyed.get(c.key));
                }
                cell.align  = c.align;
                cell.weight = (colIndex == 0) ? 'semibold' : 'regular';
                row.cells.add(cell);
                colIndex++;
            }
            setPositionalCells(row, cols);
            out.add(row);
        }
        return out;
    }

    // Type-safe normalizers for the typed badge/highlight inputs: drop nulls and default the enum
    // tokens (mirrors toBadges/toHighlights for the legacy JSON path).
    private static List<Badge> normalizeBadges(List<Badge> raw) {
        List<Badge> out = new List<Badge>();
        if (raw == null) return out;
        for (Badge b : raw) {
            if (b == null) continue;
            b.variant = firstNonBlank(b.variant, 'neutral');
            out.add(b);
        }
        return out;
    }

    private static List<Highlight> normalizeHighlights(List<Highlight> raw) {
        List<Highlight> out = new List<Highlight>();
        if (raw == null) return out;
        for (Highlight h : raw) {
            if (h == null) continue;
            h.iconColor = firstNonBlank(h.iconColor, 'default');
            out.add(h);
        }
        return out;
    }

    // Copy the row's column-ordered cells into the fixed positional scalars the widget binds.
    // cNShow marks whether column N exists (so the widget hides trailing empty slots and stays
    // aligned with the header); cNAlign carries the column alignment. The first column is emphasized
    // in the widget (static semibold), so only value + align + show are needed here.
    private static void setPositionalCells(RowVM row, List<ColumnVM> cols) {
        for (Integer k = 0; k < MAX_COLS; k++) {
            Boolean present = k < cols.size();
            String  val   = (present && row.cells != null && k < row.cells.size()) ? row.cells[k].value : null;
            String  align = present ? cols[k].align : 'start';
            if (k == 0) { row.c1 = val; row.c1Show = present; row.c1Align = align; }
            else if (k == 1) { row.c2 = val; row.c2Show = present; row.c2Align = align; }
            else if (k == 2) { row.c3 = val; row.c3Show = present; row.c3Align = align; }
            else if (k == 3) { row.c4 = val; row.c4Show = present; row.c4Align = align; }
            else if (k == 4) { row.c5 = val; row.c5Show = present; row.c5Align = align; }
            else { row.c6 = val; row.c6Show = present; row.c6Align = align; }
        }
    }

    private static List<Badge> toBadges(Object raw) {
        List<Badge> out = new List<Badge>();
        for (Object o : asList(raw)) {
            if (!(o instanceof Map<String, Object>)) continue;
            Map<String, Object> m = (Map<String, Object>) o;
            Badge b = new Badge();
            b.label   = str(m.get('label'));
            b.variant = firstNonBlank(str(m.get('variant')), 'neutral');
            out.add(b);
        }
        return out;
    }

    private static List<Highlight> toHighlights(Object raw) {
        List<Highlight> out = new List<Highlight>();
        for (Object o : asList(raw)) {
            if (!(o instanceof Map<String, Object>)) continue;
            Map<String, Object> m = (Map<String, Object>) o;
            Highlight h = new Highlight();
            h.iconName  = str(m.get('iconName'));
            h.iconColor = firstNonBlank(str(m.get('iconColor')), 'default');
            h.title     = str(m.get('title'));
            h.detail    = str(m.get('detail'));
            out.add(h);
        }
        return out;
    }

    private static List<Object> asList(Object o) {
        return (o instanceof List<Object>) ? (List<Object>) o : new List<Object>();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Boolean boolOr(Object o, Boolean fallback) {
        if (o instanceof Boolean) return (Boolean) o;
        if (o == null) return fallback;
        return String.valueOf(o).equalsIgnoreCase('true');
    }

    private static String firstNonBlank(String a, String b) {
        return String.isNotBlank(a) ? a : b;
    }

    // No spec supplied: the caller (agent/planner) owns ALL content — this action only flattens
    // what it is given — so we hardcode NO business data. Render a neutral, empty placeholder that
    // says the card is caller-driven. (Illustrative sample data lives in the React preview harness,
    // src/demo/data/rankedTableCard.attrs.json, not in this platform code.)
    private static Map<String, Object> emptyState() {
        return new Map<String, Object>{
            'title'         => 'Tableau priorisé',
            'showSummary'   => true,
            'summaryTitle'  => 'Aucune donnée fournie',
            'summaryDetail' => 'Cette carte affiche un tableau priorisé fourni par l\'agent appelant. Fournissez un spec JSON (columns[] + records[]) pour le remplir.'
        };
    }
}
