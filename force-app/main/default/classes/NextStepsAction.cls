/**
 * NextStepsAction
 * HXL invocable action: a GENERIC, caller-driven list of proposed next steps for the nextStepsCard widget.
 *
 * The widget is "only the UI" -- it renders whatever steps the caller (an Agentforce/MCP planner)
 * proposes. This action is the interface: THE AGENT SUPPLIES THE STEPS. It passes a single JSON `spec`
 * describing the header (title/subtitle/badges), an optional summary callout, and a `steps` array where
 * each step is the next action to take (title/detail/rationale, an optional priority chip, an icon, a
 * supporting meta line, and an optional per-step link). The action NORMALIZES that spec into the
 * render-time payload the widget consumes: an ordered steps[] whose `order` badge is auto-numbered when
 * the agent leaves it blank.
 *
 * Why normalize in Apex (same rationale as RankedTableAction / ActionPlanAction): keeping the shaping
 * server-side means the widget's binding surface is only `forEach` + `meta.if <boolean>` -- no operators,
 * no dynamic key access -- so the same JSON renders identically in the local preview and in the
 * production HXL runtime.
 *
 * Binding anchor: the single @InvocableVariable field `nextSteps` (NextStepsResponse.nextSteps) must stay
 * byte-identical across the payload CLT (nextStepsCardOutputValues), the GenAiFunction output, and the
 * wrapper renderer path ({!$attrs.outputValues.nextSteps.<field>}). The NextSteps field NAMES
 * (title / subtitle / badges / steps / ...) match the widget attributes so the Agentforce (agent)
 * renderer binds them flat as {!$attrs.title} etc.
 *
 * spec JSON shape (all optional; called with no args -> a neutral empty placeholder renders, since
 * this action holds no business data of its own -- the caller supplies every step):
 * {
 *   "title": "…", "subtitle": "…",
 *   "badges": [ { "label": "…", "variant": "primary|success|warning|danger|neutral" } ],
 *   "showSummary": true, "summaryTitle": "…", "summaryDetail": "…",
 *   "stepsCaption": "…",
 *   "steps": [ {
 *     "order": "1", "stepId": "…", "selected": true, "title": "…", "detail": "…", "rationale": "…",
 *     "iconName": "phone", "iconColor": "success|warning|danger|default",
 *     "priorityLabel": "…", "priorityVariant": "primary|success|warning|danger|neutral",
 *     "meta": "…", "showCta": true, "ctaLabel": "…", "ctaUrl": "…"
 *   } ],
 *   "showCta": true, "ctaLabel": "…", "ctaUrl": "…",
 *   "selectable": true, "confirmLabel": "…", "cancelLabel": "…"
 * }
 * The `order` badge is auto-numbered (1..n) for any step that omits it.
 *
 * Actionable mode: set "selectable": true to let the user PICK which steps to act on before
 * submitting. Each step then renders a checkbox (id "step_<stepId>", initial state from "selected",
 * default checked) and the footer shows Confirm/Cancel buttons. Confirm dispatches the "stepsConfirm"
 * action with inputs:"auto" — one { "step_<stepId>": true|false } payload the calling agent handles;
 * Cancel dispatches "stepsCancel". Selectable suppresses the navigating footer CTA.
 */
global with sharing class NextStepsAction {

    // ---- Invocable input ----
    global class Request {
        @InvocableVariable(label='Next steps spec (JSON)' description='JSON describing the proposed next steps: optional title/subtitle, a "badges" array, an optional summary callout (showSummary/summaryTitle/summaryDetail), and a "steps" array where each step has a title plus optional detail, rationale, iconName, iconColor, priorityLabel, priorityVariant, meta line and a per-step link (showCta/ctaLabel/ctaUrl). Set "selectable": true (with confirmLabel/cancelLabel) to make the card actionable — a checkbox per step (initial state via each step\'s "selected", default checked) and Confirm/Cancel buttons that submit the chosen steps. Leave blank to render a neutral empty placeholder (this action stores no steps of its own).' required=false)
        global String spec;
    }

    // ---- Invocable response wrapper (binding anchor: nextSteps) ----
    global class NextStepsResponse {
        @InvocableVariable(label='Next Steps' description='The normalized next-steps payload rendered by the nextStepsCard widget. Binding anchor: this field name is byte-identical across the payload CLT, the GenAiFunction output, and the wrapper renderer path.')
        global NextSteps nextSteps;
    }

    // ---- Render-time payload the widget consumes ----
    global class NextSteps {
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
        @InvocableVariable(label='Steps Caption' description='Caption above the steps list.')
        global String stepsCaption;
        @InvocableVariable(label='Steps' description='Ordered list of proposed next steps (rendered top to bottom).')
        global List<StepVM> steps;
        @InvocableVariable(label='Show CTA' description='Toggle for the footer CTA button; derived from ctaLabel when omitted. Forced off when selectable is true.')
        global Boolean showCta;
        @InvocableVariable(label='CTA Label' description='Footer CTA button label.')
        global String ctaLabel;
        @InvocableVariable(label='CTA URL' description='Footer CTA button href.')
        global String ctaUrl;
        @InvocableVariable(label='Selectable' description='When true the card becomes actionable: each step shows a checkbox and the footer shows Confirm/Cancel buttons so the user picks which steps to act on before submitting. Suppresses the navigating footer CTA. Default false (read-only list).')
        global Boolean selectable;
        @InvocableVariable(label='Confirm Label' description='Label of the primary submit button shown when selectable is true.')
        global String confirmLabel;
        @InvocableVariable(label='Cancel Label' description='Label of the secondary cancel button shown when selectable is true.')
        global String cancelLabel;
    }

    global class Badge {
        @InvocableVariable(label='Label' description='Badge text.')
        global String label;
        @InvocableVariable(label='Variant' description='Color token. MUST be EXACTLY one of: primary | success | warning | danger | neutral. Do NOT use any other word — not "info", not "critical", not a CSS color like "blue"/"green". Any unlisted value renders as a plain grey badge.')
        global String variant;
    }

    // One proposed next step.
    global class StepVM {
        @InvocableVariable(label='Order' description='Step number badge (1..n); auto-numbered when the agent leaves it blank.')
        global String order;
        @InvocableVariable(label='Step Id' description='Stable per-step key used to build the checkbox id (step_<stepId>) when the card is selectable; defaults to the order number.')
        global String stepId;
        @InvocableVariable(label='Selected' description='Initial checkbox state when the card is selectable (default true — the user unchecks the steps they will skip).')
        global Boolean selected;
        @InvocableVariable(label='Title' description='Step title — the action to take.')
        global String title;
        @InvocableVariable(label='Detail' description='What to do, in one line.')
        global String detail;
        @InvocableVariable(label='Rationale' description='Why this step / the expected outcome.')
        global String rationale;
        @InvocableVariable(label='Icon Name' description='A LUCIDE icon slug (lucide.dev), NOT an SLDS name. Pick from: phone, mail, file-text, clipboard-list, calendar, clock, bell, user, users, building, credit-card, check-circle, activity, trending-up. Do NOT use SLDS names like "document", "call", "assessment", "task" — they will not render. If unsure, omit it.')
        global String iconName;
        @InvocableVariable(label='Icon Color' description='Color token. MUST be EXACTLY one of: success | warning | danger | default. Do NOT use a CSS color like "blue"/"green"/"purple" — those render as the default grey.')
        global String iconColor;
        @InvocableVariable(label='Priority Label' description='Optional priority/effort chip text (free text, e.g. "Prioritaire", "À planifier").')
        global String priorityLabel;
        @InvocableVariable(label='Priority Variant' description='Color token for the priority chip. MUST be EXACTLY one of: primary | success | warning | danger | neutral. Do NOT use "critical"/"high"/"info" or a CSS color. Use "danger" for the most urgent.')
        global String priorityVariant;
        @InvocableVariable(label='Meta' description='Supporting line (owner, due date, effort).')
        global String meta;
        @InvocableVariable(label='Show CTA' description='Toggle for the per-step action link; derived from ctaLabel when omitted.')
        global Boolean showCta;
        @InvocableVariable(label='CTA Label' description='Per-step action link — give each step ONE so it is actionable. Use a short imperative matching the step, e.g. "Ouvrir le devis", "Appeler le client", "Créer la tâche", "Planifier". Set the ctaUrl alongside it.')
        global String ctaLabel;
        @InvocableVariable(label='CTA URL' description='Per-step link href (the record/page/action the label opens). Use "#" only if no real target is available.')
        global String ctaUrl;
    }

    @InvocableMethod(label='Get Next Steps' description='Renders a generic, caller-driven list of proposed next steps in the nextStepsCard HXL widget. THE AGENT SUPPLIES THE STEPS: pass a JSON spec of steps (plus optional badges, summary and a CTA); the action normalizes them into an ordered, typed steps[] the user reads. Call with no spec to render a neutral empty placeholder (the action holds no steps of its own).')
    global static List<NextStepsResponse> getNextSteps(List<Request> requests) {
        String spec = (requests != null && !requests.isEmpty()) ? requests[0].spec : null;

        Map<String, Object> parsed;
        if (String.isBlank(spec)) {
            parsed = emptyState();
        } else {
            try {
                parsed = (Map<String, Object>) JSON.deserializeUntyped(spec);
            } catch (Exception e) {
                // Malformed JSON -> render an empty, still-valid card rather than throwing at the planner.
                parsed = new Map<String, Object>{ 'title' => 'Invalid next-steps spec', 'summaryTitle' => 'The provided JSON could not be parsed.', 'showSummary' => true };
            }
        }

        NextStepsResponse res = new NextStepsResponse();
        res.nextSteps = build(parsed);

        return new List<NextStepsResponse>{ res };
    }

    // Normalize a parsed spec into the render-time payload (auto-numbering the step order).
    private static NextSteps build(Map<String, Object> spec) {
        NextSteps n = new NextSteps();
        n.title        = str(spec.get('title'));
        n.subtitle     = str(spec.get('subtitle'));
        n.summaryTitle = str(spec.get('summaryTitle'));
        n.summaryDetail= str(spec.get('summaryDetail'));
        n.stepsCaption = str(spec.get('stepsCaption'));
        n.ctaLabel     = str(spec.get('ctaLabel'));
        n.ctaUrl       = str(spec.get('ctaUrl'));

        n.badges = toBadges(spec.get('badges'));

        n.steps = new List<StepVM>();
        Integer index = 0;
        for (Object o : asList(spec.get('steps'))) {
            if (!(o instanceof Map<String, Object>)) continue;
            Map<String, Object> m = (Map<String, Object>) o;
            index++;
            StepVM s = new StepVM();
            s.order           = firstNonBlank(str(m.get('order')), String.valueOf(index));
            s.stepId          = firstNonBlank(str(m.get('stepId')), s.order);
            s.selected        = boolOr(m.get('selected'), true);
            s.title           = str(m.get('title'));
            s.detail          = str(m.get('detail'));
            s.rationale       = str(m.get('rationale'));
            s.iconName        = str(m.get('iconName'));
            s.iconColor       = firstNonBlank(str(m.get('iconColor')), 'default');
            s.priorityLabel   = str(m.get('priorityLabel'));
            s.priorityVariant = firstNonBlank(str(m.get('priorityVariant')), 'neutral');
            s.meta            = str(m.get('meta'));
            s.ctaLabel        = str(m.get('ctaLabel'));
            s.ctaUrl          = str(m.get('ctaUrl'));
            s.showCta         = boolOr(m.get('showCta'), String.isNotBlank(s.ctaLabel));
            n.steps.add(s);
        }

        // Section toggles: honor an explicit boolean, else derive from content.
        n.showSummary = boolOr(spec.get('showSummary'), String.isNotBlank(n.summaryTitle) || String.isNotBlank(n.summaryDetail));
        n.showCta     = boolOr(spec.get('showCta'), String.isNotBlank(n.ctaLabel));

        // selectable / confirmLabel / cancelLabel are RESERVED for an interactive runtime
        // (checkbox-per-step + Confirm). The live HXL Beta runtime on some orgs rejects input
        // tiles and action buttons (see live-validator-deltas Delta 7), so the deployable card is
        // read-only + navigational links: each step's own CTA (showCta/ctaLabel/ctaUrl) is the
        // action. We still pass these fields through so the same spec drives an interactive
        // runtime unchanged where one is available.
        n.selectable   = boolOr(spec.get('selectable'), false);
        n.confirmLabel = str(spec.get('confirmLabel'));
        n.cancelLabel  = str(spec.get('cancelLabel'));
        return n;
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

    // No spec supplied: the caller (agent/planner) owns ALL content — this action only normalizes
    // what it is given — so we hardcode NO business data. Render a neutral, empty placeholder that
    // says the card is caller-driven. (Illustrative sample data lives in the React preview harness,
    // src/demo/data/nextStepsCard.attrs.json, not in this platform code.)
    private static Map<String, Object> emptyState() {
        return new Map<String, Object>{
            'title'         => 'Prochaines étapes',
            'showSummary'   => true,
            'summaryTitle'  => 'Aucune étape fournie',
            'summaryDetail' => 'Cette carte affiche les prochaines étapes proposées par l\'agent appelant. Fournissez un spec JSON (steps[]) pour la remplir.'
        };
    }
}
