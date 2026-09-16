/**
 * RankedTableAction
 * HXL invocable action: a GENERIC, caller-driven ranked/prioritized table for the rankedTableCard widget.
 *
 * The widget is "only the UI" -- it renders whatever columns + rows the caller (an Agentforce/MCP
 * planner) provides. This action is the interface: the agent supplies a single JSON `spec` describing
 * the header (title/subtitle/badges), an optional summary callout, the table (columns + rows, where
 * each row is keyed by the column keys), optional highlights, and an optional CTA. The action
 * FLATTENS the keyed rows into the render-time payload the widget consumes: rows[].cells[], where
 * each cell carries its display value, alignment, and weight in COLUMN ORDER.
 *
 * Why flatten in Apex rather than in the widget: Apex @InvocableVariable cannot express a
 * dynamic-keyed row (a Map), and a native tile/table bound to arbitrary keys cannot be produced from
 * a typed CLT. Flattening keeps the widget's binding surface to plain `forEach` + `meta.if <boolean>`
 * only -- no operators, no dynamic key access -- so the same JSON renders identically in the local
 * preview and in the production HXL runtime. (Same rationale as ActionPlanAction.)
 *
 * Binding anchor: the single @InvocableVariable field `table` (RankedTableResponse.table) must stay
 * byte-identical across the payload CLT (rankedTableCardOutputValues), the GenAiFunction output, and
 * the wrapper renderer path ({!$attrs.outputValues.table.<field>}). The RankedTable field NAMES
 * (title / subtitle / badges / columns / rows / ...) match the widget attributes so the Agentforce
 * (agent) renderer binds them flat as {!$attrs.title} etc.
 *
 * spec JSON shape (all optional; called with no args -> a portable demo pipeline renders):
 * {
 *   "title": "…", "subtitle": "…",
 *   "badges": [ { "label": "…", "variant": "primary|success|warning|danger|neutral" } ],
 *   "showSummary": true, "summaryTitle": "…", "summaryDetail": "…",
 *   "tableCaption": "…",
 *   "columns": [ { "key": "amount", "header": "Montant", "align": "start|end|center" } ],
 *   "rows":    [ { "id": "r1", "amount": "42 000 €", "…": "…" } ],
 *   "showHighlights": true, "highlightsCaption": "…",
 *   "highlights": [ { "iconName": "trending-up", "iconColor": "success", "title": "…", "detail": "…" } ],
 *   "showCta": true, "ctaLabel": "…", "ctaUrl": "…"
 * }
 * Each row value is looked up by the column key and rendered read-only. The first column is emphasized
 * (semibold); a right-aligned column ("align":"end") is used for numeric/amount columns.
 */
global with sharing class RankedTableAction {

    // ---- Invocable input ----
    global class Request {
        @InvocableVariable(label='Table spec (JSON)' description='JSON describing the ranked table: optional title/subtitle, a "badges" array, an optional summary callout (showSummary/summaryTitle/summaryDetail), a "columns" array (key,header,align[start|end|center]) and a "rows" array (each row has an optional "id" plus a value per column key), optional "highlights" (iconName,iconColor,title,detail) and an optional CTA (ctaLabel,ctaUrl). Leave blank to render a portable demo pipeline.' required=false)
        global String spec;
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
        @InvocableVariable(label='Variant' description='primary | success | warning | danger | neutral.')
        global String variant;
    }

    global class ColumnVM {
        @InvocableVariable(label='Key' description='Column key (latent; matches the spec row keys).')
        global String key;
        @InvocableVariable(label='Header' description='Column header label.')
        global String header;
        @InvocableVariable(label='Align' description='start | end | center (use end for numeric/amount columns).')
        global String align;
    }

    global class RowVM {
        @InvocableVariable(label='Id' description='Row id.')
        global String id;
        @InvocableVariable(label='Cells' description='One cell per column, in column order.')
        global List<CellVM> cells;
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
        @InvocableVariable(label='Icon Name' description='Lucide icon slug.')
        global String iconName;
        @InvocableVariable(label='Icon Color' description='success | warning | danger | default.')
        global String iconColor;
        @InvocableVariable(label='Title' description='Highlight title.')
        global String title;
        @InvocableVariable(label='Detail' description='Highlight detail.')
        global String detail;
    }

    @InvocableMethod(label='Get Ranked Table' description='Renders a generic, caller-driven ranked/prioritized table in the rankedTableCard HXL widget. Pass a JSON spec of columns + rows (plus optional badges, summary, highlights and a CTA); the action flattens the keyed rows into typed, column-ordered cells the user reads. Call with no spec to show a portable demo pipeline.')
    global static List<RankedTableResponse> getRankedTable(List<Request> requests) {
        String spec = (requests != null && !requests.isEmpty()) ? requests[0].spec : null;

        Map<String, Object> parsed;
        if (String.isBlank(spec)) {
            parsed = demoSpec();
        } else {
            try {
                parsed = (Map<String, Object>) JSON.deserializeUntyped(spec);
            } catch (Exception e) {
                // Malformed JSON -> render an empty, still-valid card rather than throwing at the planner.
                parsed = new Map<String, Object>{ 'title' => 'Invalid table spec', 'summaryTitle' => 'The provided JSON could not be parsed.', 'showSummary' => true };
            }
        }

        RankedTableResponse res = new RankedTableResponse();
        res.table = build(parsed);

        return new List<RankedTableResponse>{ res };
    }

    // Flatten a parsed spec (columns + keyed rows) into the render-time payload (columns[] + rows[].cells[]).
    private static RankedTable build(Map<String, Object> spec) {
        RankedTable t = new RankedTable();
        t.title        = str(spec.get('title'));
        t.subtitle     = str(spec.get('subtitle'));
        t.summaryTitle = str(spec.get('summaryTitle'));
        t.summaryDetail= str(spec.get('summaryDetail'));
        t.tableCaption = str(spec.get('tableCaption'));
        t.highlightsCaption = str(spec.get('highlightsCaption'));
        t.ctaLabel     = str(spec.get('ctaLabel'));
        t.ctaUrl       = str(spec.get('ctaUrl'));

        t.badges = toBadges(spec.get('badges'));
        t.highlights = toHighlights(spec.get('highlights'));

        // Columns (retain key/header/align; default align to start).
        t.columns = new List<ColumnVM>();
        List<Object> columns = asList(spec.get('columns'));
        for (Object colObj : columns) {
            if (!(colObj instanceof Map<String, Object>)) continue;
            Map<String, Object> col = (Map<String, Object>) colObj;
            ColumnVM c = new ColumnVM();
            c.key    = str(col.get('key'));
            c.header = str(col.get('header'));
            c.align  = firstNonBlank(str(col.get('align')), 'start');
            t.columns.add(c);
        }

        // Rows: one cell per column, in column order. The first column is emphasized.
        t.rows = new List<RowVM>();
        List<Object> rows = asList(spec.get('rows'));
        Integer rowIndex = 0;
        for (Object rowObj : rows) {
            if (!(rowObj instanceof Map<String, Object>)) continue;
            Map<String, Object> rowMap = (Map<String, Object>) rowObj;
            RowVM row = new RowVM();
            row.id = firstNonBlank(str(rowMap.get('id')), 'row' + rowIndex);
            rowIndex++;
            row.cells = new List<CellVM>();
            Integer colIndex = 0;
            for (ColumnVM c : t.columns) {
                CellVM cell = new CellVM();
                cell.value  = str(rowMap.get(c.key));
                cell.align  = c.align;
                cell.weight = (colIndex == 0) ? 'semibold' : 'regular';
                row.cells.add(cell);
                colIndex++;
            }
            t.rows.add(row);
        }

        // Section toggles: honor an explicit boolean, else derive from content.
        t.showSummary    = boolOr(spec.get('showSummary'), String.isNotBlank(t.summaryTitle) || String.isNotBlank(t.summaryDetail));
        t.showHighlights = boolOr(spec.get('showHighlights'), t.highlights != null && !t.highlights.isEmpty());
        t.showCta        = boolOr(spec.get('showCta'), String.isNotBlank(t.ctaLabel));
        return t;
    }

    // ---- helpers ----

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

    // A portable, self-contained demo pipeline so a no-argument call still renders a meaningful card
    // (mirrors src/demo/data/rankedTableCard.attrs.json). Built as Maps/Lists to avoid escaping the
    // accented French labels inside a JSON string literal.
    private static Map<String, Object> demoSpec() {
        List<Object> columns = new List<Object>{
            col('opp', 'Opportunité', 'start'),
            col('amount', 'Montant', 'end'),
            col('stage', 'Étape', 'start'),
            col('tier', 'Palier', 'start'),
            col('score', 'Indice', 'end')
        };

        List<Object> rows = new List<Object>{
            row('delaunay', 'Multirisque PME Delaunay', '42 000 €', 'Négociation', 'Palier 1', '88'),
            row('vidal', 'Flotte auto Transports Vidal', '31 000 €', 'Proposition', 'Palier 2', '74'),
            row('meyer', 'Santé collective Cabinet Meyer', '12 500 €', 'Découverte', 'Palier 3', '41')
        };

        List<Object> badges = new List<Object>{
            badge('3 opportunités', 'primary'),
            badge('1 en palier 1', 'danger')
        };

        List<Object> highlights = new List<Object>{
            highlight('trending-up', 'success', 'Multirisque PME Delaunay', 'Clôture imminente, forte confiance — envoyer le devis signable.'),
            highlight('clock', 'warning', 'Flotte Transports Vidal', 'Relevé de sinistralité manquant — à relancer avant de caler le closing.'),
            highlight('bell', 'danger', 'Santé collective Cabinet Meyer', 'Décideur RH non identifié — à déprioriser pour l\'instant.')
        };

        return new Map<String, Object>{
            'title'         => 'Opportunités priorisées',
            'subtitle'      => 'Agence Roussel · Bordeaux · cette semaine',
            'badges'        => badges,
            'showSummary'   => true,
            'summaryTitle'  => 'Concentrez-vous sur Delaunay et Vidal',
            'summaryDetail' => 'Multirisque PME Delaunay est proche de la clôture et à forte confiance — envoyez le devis signable dès aujourd\'hui.',
            'tableCaption'  => 'Opportunités ouvertes, triées par indice de priorité',
            'columns'       => columns,
            'rows'          => rows,
            'showHighlights'=> true,
            'highlightsCaption' => 'FOCUS DE LA SEMAINE',
            'highlights'    => highlights,
            'showCta'       => true,
            'ctaLabel'      => 'Ouvrir le pipeline',
            'ctaUrl'        => '#'
        };
    }

    private static Map<String, Object> col(String key, String header, String align) {
        return new Map<String, Object>{ 'key' => key, 'header' => header, 'align' => align };
    }

    private static Map<String, Object> row(String id, String opp, String amount, String stage, String tier, String score) {
        return new Map<String, Object>{ 'id' => id, 'opp' => opp, 'amount' => amount, 'stage' => stage, 'tier' => tier, 'score' => score };
    }

    private static Map<String, Object> badge(String label, String variant) {
        return new Map<String, Object>{ 'label' => label, 'variant' => variant };
    }

    private static Map<String, Object> highlight(String iconName, String iconColor, String title, String detail) {
        return new Map<String, Object>{ 'iconName' => iconName, 'iconColor' => iconColor, 'title' => title, 'detail' => detail };
    }
}
