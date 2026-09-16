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
 * spec JSON shape (all optional; called with no args -> a portable demo plan renders):
 * {
 *   "title": "…", "subtitle": "…",
 *   "badges": [ { "label": "…", "variant": "primary|success|warning|danger|neutral" } ],
 *   "showSummary": true, "summaryTitle": "…", "summaryDetail": "…",
 *   "stepsCaption": "…",
 *   "steps": [ {
 *     "order": "1", "title": "…", "detail": "…", "rationale": "…",
 *     "iconName": "phone", "iconColor": "success|warning|danger|default",
 *     "priorityLabel": "…", "priorityVariant": "primary|success|warning|danger|neutral",
 *     "meta": "…", "showCta": true, "ctaLabel": "…", "ctaUrl": "…"
 *   } ],
 *   "showCta": true, "ctaLabel": "…", "ctaUrl": "…"
 * }
 * The `order` badge is auto-numbered (1..n) for any step that omits it.
 */
global with sharing class NextStepsAction {

    // ---- Invocable input ----
    global class Request {
        @InvocableVariable(label='Next steps spec (JSON)' description='JSON describing the proposed next steps: optional title/subtitle, a "badges" array, an optional summary callout (showSummary/summaryTitle/summaryDetail), and a "steps" array where each step has a title plus optional detail, rationale, iconName, iconColor, priorityLabel, priorityVariant, meta line and a per-step link (showCta/ctaLabel/ctaUrl). Leave blank to render a portable demo plan.' required=false)
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
        @InvocableVariable(label='Show CTA' description='Toggle for the footer CTA button; derived from ctaLabel when omitted.')
        global Boolean showCta;
        @InvocableVariable(label='CTA Label' description='Footer CTA button label.')
        global String ctaLabel;
        @InvocableVariable(label='CTA URL' description='Footer CTA button href.')
        global String ctaUrl;
    }

    global class Badge {
        @InvocableVariable(label='Label' description='Badge text.')
        global String label;
        @InvocableVariable(label='Variant' description='primary | success | warning | danger | neutral.')
        global String variant;
    }

    // One proposed next step.
    global class StepVM {
        @InvocableVariable(label='Order' description='Step number badge (1..n); auto-numbered when the agent leaves it blank.')
        global String order;
        @InvocableVariable(label='Title' description='Step title — the action to take.')
        global String title;
        @InvocableVariable(label='Detail' description='What to do, in one line.')
        global String detail;
        @InvocableVariable(label='Rationale' description='Why this step / the expected outcome.')
        global String rationale;
        @InvocableVariable(label='Icon Name' description='Lucide icon slug shown next to the step.')
        global String iconName;
        @InvocableVariable(label='Icon Color' description='success | warning | danger | default.')
        global String iconColor;
        @InvocableVariable(label='Priority Label' description='Optional priority/effort chip text.')
        global String priorityLabel;
        @InvocableVariable(label='Priority Variant' description='primary | success | warning | danger | neutral.')
        global String priorityVariant;
        @InvocableVariable(label='Meta' description='Supporting line (owner, due date, effort).')
        global String meta;
        @InvocableVariable(label='Show CTA' description='Toggle for the per-step link; derived from ctaLabel when omitted.')
        global Boolean showCta;
        @InvocableVariable(label='CTA Label' description='Per-step link label.')
        global String ctaLabel;
        @InvocableVariable(label='CTA URL' description='Per-step link href.')
        global String ctaUrl;
    }

    @InvocableMethod(label='Get Next Steps' description='Renders a generic, caller-driven list of proposed next steps in the nextStepsCard HXL widget. THE AGENT SUPPLIES THE STEPS: pass a JSON spec of steps (plus optional badges, summary and a CTA); the action normalizes them into an ordered, typed steps[] the user reads. Call with no spec to show a portable demo plan.')
    global static List<NextStepsResponse> getNextSteps(List<Request> requests) {
        String spec = (requests != null && !requests.isEmpty()) ? requests[0].spec : null;

        Map<String, Object> parsed;
        if (String.isBlank(spec)) {
            parsed = demoSpec();
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

    // A portable, self-contained demo plan so a no-argument call still renders a meaningful card
    // (mirrors src/demo/data/nextStepsCard.attrs.json). Built as Maps/Lists to avoid escaping the
    // accented French labels inside a JSON string literal.
    private static Map<String, Object> demoSpec() {
        List<Object> badges = new List<Object>{
            badge('4 étapes', 'primary'),
            badge('2 prioritaires', 'danger')
        };

        List<Object> steps = new List<Object>{
            step('1', 'Envoyer le devis signable à Delaunay', 'Générer le devis Multirisque PME et le transmettre pour signature électronique.',
                 'Clôture imminente, forte confiance — c\'est le levier le plus rentable de la semaine.', 'file-text', 'success',
                 'Prioritaire', 'danger', 'Vous · aujourd\'hui · 15 min', 'Ouvrir le devis', '#'),
            step('2', 'Relancer Transports Vidal pour la sinistralité', 'Appeler le gestionnaire pour obtenir le relevé de sinistralité manquant.',
                 'Pièce bloquante avant de caler le closing de la flotte auto.', 'phone', 'warning',
                 'Prioritaire', 'danger', 'Vous · avant jeudi · 10 min', null, null),
            step('3', 'Qualifier le décideur RH chez Cabinet Meyer', 'Identifier et contacter le responsable RH pour la santé collective.',
                 'Sans décideur identifié, l\'opportunité reste bloquée en découverte.', 'users', 'default',
                 'À planifier', 'warning', 'Vous · cette semaine', null, null),
            step('4', 'Préparer la revue de portefeuille', 'Compiler les indices de priorité pour le point hebdo de l\'agence.',
                 'Aligne l\'équipe sur les 3 dossiers à pousser en priorité.', 'clipboard-list', 'default',
                 null, 'neutral', 'Vous · vendredi', null, null)
        };

        return new Map<String, Object>{
            'title'         => 'Prochaines étapes',
            'subtitle'      => 'Agence Roussel · Bordeaux · cette semaine',
            'badges'        => badges,
            'showSummary'   => true,
            'summaryTitle'  => 'Commencez par Delaunay et Vidal',
            'summaryDetail' => 'Deux gestes rapides débloquent les deux plus grosses opportunités : envoyez le devis Delaunay et récupérez la sinistralité de Vidal.',
            'stepsCaption'  => 'PLAN D\'ACTION',
            'steps'         => steps,
            'showCta'       => true,
            'ctaLabel'      => 'Tout ajouter à mes tâches',
            'ctaUrl'        => '#'
        };
    }

    private static Map<String, Object> badge(String label, String variant) {
        return new Map<String, Object>{ 'label' => label, 'variant' => variant };
    }

    private static Map<String, Object> step(String order, String title, String detail, String rationale, String iconName,
                                            String iconColor, String priorityLabel, String priorityVariant, String meta,
                                            String ctaLabel, String ctaUrl) {
        Map<String, Object> m = new Map<String, Object>{
            'order' => order, 'title' => title, 'detail' => detail, 'rationale' => rationale,
            'iconName' => iconName, 'iconColor' => iconColor, 'priorityLabel' => priorityLabel,
            'priorityVariant' => priorityVariant, 'meta' => meta
        };
        if (ctaLabel != null) { m.put('ctaLabel', ctaLabel); m.put('ctaUrl', ctaUrl); }
        return m;
    }
}
