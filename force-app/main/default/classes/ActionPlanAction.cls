/**
 * ActionPlanAction
 * HXL invocable action: a GENERIC, caller-driven editable action grid for the actionPlan widget.
 *
 * The widget is "only the UI" -- it renders whatever columns + data the caller provides. This action
 * is the interface: the caller (an Agentforce/MCP planner) passes a single JSON `spec` describing the
 * columns (key / label / type / options) and the rows (a value per column key), and the action
 * FLATTENS that into the render-time payload the widget consumes: rows[].cells[], where every cell
 * carries its own data-bound inputId, a typed input flag (readonly / select / text / switch), its
 * value (or checked state), and -- for selects -- its option list.
 *
 * Why flatten in Apex rather than in the widget: it keeps the widget's binding surface to plain
 * `forEach` + `meta.if <boolean>` only, with no operators or dynamic key access, so the same JSON
 * renders identically in the local preview and in the production HXL runtime.
 *
 * Binding anchor: the single @InvocableVariable field `plan` (ActionPlanResponse.plan) must stay
 * byte-identical across the payload CLT (actionPlanOutputValues), the GenAiFunction output, and the
 * wrapper renderer path ({!$attrs.outputValues.plan.<field>}). The ActionPlan field NAMES
 * (title / subtitle / note / confirmLabel / cancelLabel / rows) match the widget attributes so the
 * Agentforce (agent) renderer binds them flat as {!$attrs.title} etc.
 *
 * spec JSON shape (all optional; called with no args -> a neutral empty placeholder renders, since
 * this action holds no business data of its own -- the caller supplies every column and row):
 * {
 *   "title": "…", "subtitle": "…", "note": "…",
 *   "confirmLabel": "…", "cancelLabel": "…",
 *   "columns": [ { "key": "owner", "label": "Owner", "type": "select",
 *                  "options": [ { "label": "…", "value": "…" } ], "placeholder": "…" } ],
 *   "rows":    [ { "id": "r1", "owner": "…", "due": "…", "approve": true } ]
 * }
 * Column types: readonly (display text) | text (textField) | select (picklist) | switch (toggle).
 * Each editable cell's input id is "<column.key>_<row.id>", so a Confirm button's inputs:"auto"
 * gathers the whole revised grid as one payload.
 */
global with sharing class ActionPlanAction {

    // ---- Invocable input ----
    global class Request {
        @InvocableVariable(label='Grid spec (JSON)' description='JSON describing the grid: optional title/subtitle/note/confirmLabel/cancelLabel, a "columns" array (key,label,type[readonly|text|select|switch],options?,placeholder?) and a "rows" array (each row has an "id" plus a value per column key). Leave blank to render a neutral empty placeholder (this action stores no rows of its own).' required=false)
        global String spec;
    }

    // ---- Invocable response wrapper (binding anchor: plan) ----
    global class ActionPlanResponse {
        @InvocableVariable global ActionPlan plan;
    }

    // ---- Render-time payload the widget consumes ----
    global class ActionPlan {
        @InvocableVariable global String title;
        @InvocableVariable global String subtitle;
        @InvocableVariable global String note;
        @InvocableVariable global String confirmLabel;
        @InvocableVariable global String cancelLabel;
        @InvocableVariable global List<RowVM> rows;
    }

    global class RowVM {
        @InvocableVariable global String id;
        @InvocableVariable global List<CellVM> cells;
    }

    // One flattened cell. Exactly one of the is* flags is true; the widget renders that branch only.
    global class CellVM {
        @InvocableVariable global String key;         // owning column key
        @InvocableVariable global String label;       // column label
        @InvocableVariable global String type;        // resolved type (readonly/text/select/switch); latent, for debug
        @InvocableVariable global String inputId;     // "<key>_<rowId>" — the data-bound input id
        @InvocableVariable global String value;       // display/edit value (readonly/text/select)
        @InvocableVariable global String placeholder; // textField placeholder
        @InvocableVariable global Boolean checked;    // switch state
        @InvocableVariable global Boolean isReadonly;
        @InvocableVariable global Boolean isText;
        @InvocableVariable global Boolean isSelect;
        @InvocableVariable global Boolean isSwitch;
        @InvocableVariable global List<Option> options; // select options
    }

    global class Option {
        @InvocableVariable global String label;
        @InvocableVariable global String value;
    }

    @InvocableMethod(label='Get Action Plan' description='Renders a generic, caller-driven editable action grid in the actionPlan HXL widget. Pass a JSON spec of columns + rows; the action flattens it into typed, data-bound cells the user reviews, adjusts, and confirms. Call with no spec to render a neutral empty placeholder (the action holds no rows of its own).')
    global static List<ActionPlanResponse> getActionPlan(List<Request> requests) {
        String spec = (requests != null && !requests.isEmpty()) ? requests[0].spec : null;

        Map<String, Object> parsed;
        if (String.isBlank(spec)) {
            parsed = emptyState();
        } else {
            try {
                parsed = (Map<String, Object>) JSON.deserializeUntyped(spec);
            } catch (Exception e) {
                // Malformed JSON -> render an empty, still-valid card rather than throwing at the planner.
                parsed = new Map<String, Object>{ 'title' => 'Invalid plan spec', 'note' => 'The provided JSON could not be parsed.' };
            }
        }

        ActionPlanResponse res = new ActionPlanResponse();
        res.plan = build(parsed);

        List<ActionPlanResponse> results = new List<ActionPlanResponse>();
        results.add(res);
        return results;
    }

    // Flatten a parsed spec (columns + rows) into the render-time payload (rows[].cells[]).
    private static ActionPlan build(Map<String, Object> spec) {
        ActionPlan p = new ActionPlan();
        p.title        = str(spec.get('title'));
        p.subtitle     = str(spec.get('subtitle'));
        p.note         = str(spec.get('note'));
        p.confirmLabel = firstNonBlank(str(spec.get('confirmLabel')), 'Confirm');
        p.cancelLabel  = firstNonBlank(str(spec.get('cancelLabel')), 'Cancel');
        p.rows         = new List<RowVM>();

        List<Object> columns = asList(spec.get('columns'));
        List<Object> rows    = asList(spec.get('rows'));

        Integer rowIndex = 0;
        for (Object rowObj : rows) {
            if (!(rowObj instanceof Map<String, Object>)) continue;
            Map<String, Object> rowMap = (Map<String, Object>) rowObj;
            String rowId = firstNonBlank(str(rowMap.get('id')), 'row' + rowIndex);
            rowIndex++;

            RowVM row = new RowVM();
            row.id = rowId;
            row.cells = new List<CellVM>();

            for (Object colObj : columns) {
                if (!(colObj instanceof Map<String, Object>)) continue;
                Map<String, Object> col = (Map<String, Object>) colObj;
                String key = str(col.get('key'));
                if (String.isBlank(key)) continue;

                CellVM cell = new CellVM();
                cell.key         = key;
                cell.label       = str(col.get('label'));
                cell.placeholder = str(col.get('placeholder'));
                cell.inputId     = key + '_' + rowId;

                // Resolve the input type; anything unrecognized falls back to readonly display.
                String type = str(col.get('type'));
                type = String.isBlank(type) ? 'readonly' : type.trim().toLowerCase();
                cell.isSelect   = (type == 'select' || type == 'picklist');
                cell.isSwitch   = (type == 'switch' || type == 'toggle' || type == 'boolean');
                cell.isText     = (type == 'text' || type == 'textfield' || type == 'input');
                cell.isReadonly = !(cell.isSelect || cell.isSwitch || cell.isText);
                cell.type       = cell.isSelect ? 'select' : cell.isSwitch ? 'switch' : cell.isText ? 'text' : 'readonly';

                Object raw = rowMap.get(key);
                if (cell.isSwitch) {
                    cell.checked = toBool(raw);
                } else {
                    cell.value = str(raw);
                }
                if (cell.isSelect) {
                    cell.options = toOptions(col.get('options'));
                }

                row.cells.add(cell);
            }
            p.rows.add(row);
        }
        return p;
    }

    // ---- helpers ----

    private static List<Option> toOptions(Object raw) {
        List<Option> out = new List<Option>();
        for (Object o : asList(raw)) {
            if (!(o instanceof Map<String, Object>)) continue;
            Map<String, Object> m = (Map<String, Object>) o;
            Option opt = new Option();
            opt.label = str(m.get('label'));
            opt.value = str(m.get('value'));
            out.add(opt);
        }
        return out;
    }

    private static List<Object> asList(Object o) {
        return (o instanceof List<Object>) ? (List<Object>) o : new List<Object>();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Boolean toBool(Object o) {
        if (o instanceof Boolean) return (Boolean) o;
        if (o == null) return false;
        return String.valueOf(o).equalsIgnoreCase('true');
    }

    private static String firstNonBlank(String a, String b) {
        return String.isNotBlank(a) ? a : b;
    }

    // No spec supplied: the caller (agent/planner) owns ALL content — this action only flattens
    // what it is given — so we hardcode NO business data. Render a neutral, empty placeholder that
    // says the grid is caller-driven. (Illustrative sample data lives in the React preview harness,
    // src/demo/data/actionPlan.attrs.json, not in this platform code.)
    private static Map<String, Object> emptyState() {
        return new Map<String, Object>{
            'title' => 'Plan d\'actions',
            'note'  => 'Cette grille affiche un plan d\'actions fourni par l\'agent appelant. Fournissez un spec JSON (columns[] + rows[]) pour la remplir.'
        };
    }
}
