/**
 * OpportunityAction
 * HXL MCP invocable action: returns a DEAL-REVIEW payload shaped to the opportunityCard widget.
 *
 * Design note (rejig 2026-08-28, readiness pass): the card is deliberately DEAL-scoped, not
 * relationship-scoped. The relationship story (sibling pipeline, lifetime won, FSC household) lives on
 * the clientProfileCard relationship hub, which chains into this card via its "largest open deal"
 * button. This card answers one question for an advisor: where does THIS deal stand, what is the single
 * leading concern, and what needs attention next.
 *
 * The card renders: deal identity (name / client / amount / stage), a "Deal Readiness" callout with the
 * derived Leading Risk, three deal facts (probability / close date / stage age), up to three "What Needs
 * Attention" actions, a collapsible "Deal Strategy" (objective + next step), and a collapsible
 * "Activity & Risks" (last interaction, next meeting, open action items, open service cases).
 *
 * Deal Readiness scoring (computeReadiness): starts at 100 and subtracts derived, real-data penalties.
 * Deliberately does NOT penalize a normal early-stage win probability -- low probability at an early
 * stage is coherent, not a risk. The single highest-ranked firing signal becomes the Leading Risk; the
 * top three become the What-Needs-Attention actions, so score, leading risk, and actions never disagree.
 *
 * Standard/FSC objects only: Opportunity, Case, Event, Task, OpportunityFieldHistory. No custom __c.
 *
 * The payload inner class is deliberately named DealProfile, NOT Opportunity: an inner class named
 * Opportunity would shadow the standard sObject inside this class and break every SOQL/type reference
 * below. The binding anchor is the PROPERTY name `opportunity` (OpportunityResponse.opportunity), which
 * must stay byte-identical across the payload CLT, the GenAiFunction output, and the wrapper renderer.
 */
global with sharing class OpportunityAction {

    // Deal-readiness penalty thresholds (days). Tunable; defaults chosen for demo data.
    private static final Integer STALE_STAGE_DAYS = 21;  // days in current stage before "stalled"
    private static final Integer INACTIVE_DAYS    = 30;  // days without a logged touch before "inactive"

    // ---- Invocable input ----
    global class Request {
        @InvocableVariable(label='Opportunity Id or Name' description='Optional. Either a 15-/18-character Salesforce Opportunity Id OR the opportunity name. Omit or leave blank to return the default demo opportunity.' required=false)
        global String recordId;
    }

    // ---- Invocable response wrapper ----
    // The single @InvocableVariable field name (opportunity) is the binding anchor; it must match
    // the payload CLT property, the GenAiFunction output property, and the renderer path
    // ({!$attrs.outputValues.opportunity.<field>}).
    global class OpportunityResponse {
        @InvocableVariable global DealProfile opportunity;
    }

    // ---- Payload returned to the MCP tool / mapped onto the widget ----
    // Only the fields the deal-review card renders (plus the scalars those fields are built from) are
    // populated by build(). The remaining @InvocableVariable properties are retained because the deployed
    // schema.json is an immutable superset (deployed UiWidgetBundle props cannot be removed); they are
    // declared but never set, and the card no longer binds them.
    global class DealProfile {
        // ---- deal identity + facts (rendered: header + three fact boxes) ----
        @InvocableVariable global String  oppName;
        @InvocableVariable global String  accountName;       // person account (the client)
        @InvocableVariable global String  stageName;
        @InvocableVariable global String  closeDate;
        @InvocableVariable global String  ownerName;
        @InvocableVariable global Decimal probability;
        @InvocableVariable global String  daysInStageLabel;  // stage-age box ("N days in current stage")
        @InvocableVariable global String  amount;

        // ---- computed readiness (rendered: callout + narrative) ----
        @InvocableVariable global String  healthVariant;     // callout variant: success / warning / error
        @InvocableVariable global String  healthHeadline;    // "Deal Readiness · 70/100" (callout title)
        @InvocableVariable global String  healthReasons;     // "Leading risk: ..." or an all-clear
        @InvocableVariable global String  leadingRisk;        // the single derived leading concern (no prefix)
        @InvocableVariable global String  dealSnapshot;      // deal-scoped markdown narrative
        @InvocableVariable global List<StepRow> recommendedStepList; // What Needs Attention, structured (rendered natively)

        // ---- Deal Strategy (rendered: collapsible) ----
        @InvocableVariable global String  objective;         // client objective + strategy, from Description
        @InvocableVariable global String  nextStep;          // the opportunity's NextStep field

        // ---- Activity & Risks (rendered: collapsible) ----
        @InvocableVariable global String  lastTouchLabel;    // last meaningful interaction (subject · date)
        @InvocableVariable global String  nextMeetingLabel;  // next scheduled meeting (subject · date) or "None scheduled"
        @InvocableVariable global List<ActivityRow>  activities;  // open tasks + upcoming events
        @InvocableVariable global List<CaseRow>      cases;       // open service cases (drill-down)

        // ---- service-risk scalar (feeds readiness) ----
        @InvocableVariable global String  casesLabel;
        @InvocableVariable global Integer openCaseCount;

        // ---- retained for schema compatibility (declared in schema.json, cannot be removed);
        //      no longer populated or surfaced in the card ----
        @InvocableVariable global String  householdName;
        @InvocableVariable global Decimal amountRaw;
        @InvocableVariable global Integer daysToClose;
        @InvocableVariable global String  forecastCategory;
        @InvocableVariable global Decimal stageProgressPct;
        @InvocableVariable global Integer daysInStage;
        @InvocableVariable global String  relationshipPipeline;
        @InvocableVariable global Decimal relationshipPipelineRaw;
        @InvocableVariable global String  wonLifetime;
        @InvocableVariable global Decimal wonLifetimeRaw;
        @InvocableVariable global Integer openOppCount;
        @InvocableVariable global Integer dealHealthScore;
        @InvocableVariable global String  dealHealthLabel;
        @InvocableVariable global String  healthColor;
        @InvocableVariable global String  recommendedSteps;  // legacy markdown mirror
        @InvocableVariable global List<OppRow>       relatedOpps;
        @InvocableVariable global List<HouseholdRow> household;
        @InvocableVariable global String  relatedOppsLabel;
        @InvocableVariable global String  householdLabel;
        @InvocableVariable global String  activitiesLabel;
        @InvocableVariable global Integer householdCount;
        @InvocableVariable global String  householdOverflow;
        @InvocableVariable global String  householdMarkdown;
        @InvocableVariable global String  activityMarkdown;
        @InvocableVariable global Boolean hasProducts;
        @InvocableVariable global List<ContactRoleRow> stakeholders;
        @InvocableVariable global List<ProductRow>     products;
        @InvocableVariable global String recordUrl;
        @InvocableVariable global String accountUrl;
    }

    // ---- retained inner classes (schema compatibility) ----
    global class OppRow {
        @InvocableVariable global String name;
        @InvocableVariable global String stage;
        @InvocableVariable global String amount;
        @InvocableVariable global String status;
        @InvocableVariable global String sortKey;
        @InvocableVariable global String url;
    }

    global class HouseholdRow {
        @InvocableVariable global String name;
        @InvocableVariable global String role;
        @InvocableVariable global String url;
        @InvocableVariable global String initials;
    }

    global class CaseRow {
        @InvocableVariable global String caseNumber;
        @InvocableVariable global String subject;
        @InvocableVariable global String type;
        @InvocableVariable global String status;
        @InvocableVariable global String url;
    }

    // One "What Needs Attention" action, rendered natively as an icon + text row (not markdown).
    global class StepRow {
        @InvocableVariable global String text;      // the action, plain prose (no markdown markers)
        @InvocableVariable global String iconName;  // Lucide slug for the leading icon
        @InvocableVariable global String iconColor; // icon semantic color: success / warning / error / primary
    }

    global class ActivityRow {
        @InvocableVariable global String subject;
        @InvocableVariable global String type;
        @InvocableVariable global String dueDate;
        @InvocableVariable global String status;
        @InvocableVariable global String sortKey;
        @InvocableVariable global String url;
        @InvocableVariable global String statusColor;
        @InvocableVariable global String statusVariant;
    }

    global class ContactRoleRow {
        @InvocableVariable global String name;
        @InvocableVariable global String title;
        @InvocableVariable global String role;
        @InvocableVariable global String isPrimary;
        @InvocableVariable global String url;
    }

    global class ProductRow {
        @InvocableVariable global String name;
        @InvocableVariable global Decimal quantity;
        @InvocableVariable global Decimal totalPrice;
        @InvocableVariable global String url;
    }

    @InvocableMethod(label='Get Opportunity Profile' description='Returns a deal-review payload for the opportunityCard HXL widget. The recordId input is OPTIONAL: call this tool with NO arguments to get the default demo opportunity. Only pass recordId when profiling a specific, known Opportunity Id.')
    global static List<OpportunityResponse> getOpportunity(List<Request> requests) {
        OpportunityResponse res = new OpportunityResponse();
        res.opportunity = build(resolveOppId(requests));

        List<OpportunityResponse> results = new List<OpportunityResponse>();
        results.add(res);
        return results;
    }

    // Resolve the opportunity Id from the request. The chaining button on the relationship hub now
    // passes the deal's NAME (not its Id), so a bare string here is usually an opportunity name; the
    // caller may also pass a real Id (sitting on the record) or nothing at all.
    //
    // Resolution order, most-specific first, so name-passing lands on the RIGHT deal instead of the
    // org-wide fallback that caused the "new oppty" mis-routing:
    //   1. a valid 15-/18-char Id  -> use it directly
    //   2. an exact Name match     -> the deal the hub named (largest match wins on ties)
    //   3. a partial Name match    -> tolerate LLM paraphrase/truncation of the name
    //   4. nothing usable          -> the org's largest open deal (portable demo default)
    private static Id resolveOppId(List<Request> requests) {
        String raw = (requests != null && !requests.isEmpty()) ? requests[0].recordId : null;
        if (String.isNotBlank(raw)) {
            String term = raw.trim();

            // 1. valid Id -> use as-is
            try {
                return Id.valueOf(term);
            } catch (System.StringException e) {
                // not an Id -> treat as a name below
            }

            // 2. exact name match (largest amount wins if the name isn't unique)
            List<Opportunity> exact = [
                SELECT Id FROM Opportunity WHERE Name = :term
                ORDER BY Amount DESC NULLS LAST LIMIT 1
            ];
            if (!exact.isEmpty()) return exact[0].Id;

            // 3. partial name match (LLM may paraphrase or truncate the name)
            String likeKey = '%' + term + '%';
            List<Opportunity> partial = [
                SELECT Id FROM Opportunity WHERE Name LIKE :likeKey
                ORDER BY Amount DESC NULLS LAST LIMIT 1
            ];
            if (!partial.isEmpty()) return partial[0].Id;
        }
        // 4. No/invalid input: the largest open deal is the most demo-worthy. Empty org -> null (handled in build()).
        List<Opportunity> demo = [
            SELECT Id FROM Opportunity
            WHERE IsClosed = false AND Amount != null
            ORDER BY Amount DESC NULLS LAST
            LIMIT 1
        ];
        return demo.isEmpty() ? null : demo[0].Id;
    }

    private static DealProfile build(Id oppId) {
        DealProfile p = new DealProfile();

        // List (not single-row) query so a null oppId (empty org) or an Id that matches nothing
        // returns an empty, still-renderable card instead of throwing a QueryException.
        List<Opportunity> opps = [
            SELECT Id, Name, StageName, Amount, CloseDate, Probability, ForecastCategoryName,
                   IsClosed, IsWon, Owner.Name, AccountId, Account.Name, CreatedDate,
                   Description, NextStep
            FROM Opportunity WHERE Id = :oppId LIMIT 1
        ];
        if (opps.isEmpty()) {
            p.oppName      = 'No opportunity found';
            p.dealSnapshot = 'No matching opportunity was available to profile.';
            return p;
        }
        Opportunity opp = opps[0];

        String base = URL.getOrgDomainUrl().toExternalForm();
        Set<Id> activityWhatIds = new Set<Id>{ oppId };
        if (opp.AccountId != null) activityWhatIds.add(opp.AccountId);

        p.oppName          = opp.Name;
        p.accountName      = opp.Account != null ? opp.Account.Name : '';
        p.stageName        = opp.StageName;
        p.amountRaw        = opp.Amount;
        p.amount           = usd(opp.Amount);
        p.closeDate        = opp.CloseDate != null ? opp.CloseDate.format() : '';
        p.daysToClose      = opp.CloseDate != null ? Date.today().daysBetween(opp.CloseDate) : null;
        p.ownerName        = opp.Owner != null ? opp.Owner.Name : '';
        p.probability      = opp.Probability;
        p.forecastCategory = opp.ForecastCategoryName;

        // ---- Deal Strategy: objective (from Description) + next step ----
        // Trim the objective so it does not restate the amount and deal name already in the header:
        // if the opening sentence echoes the amount, drop it and lead with the substantive detail.
        p.objective = String.isNotBlank(opp.Description)
            ? condenseObjective(opp.Description, opp.Amount)
            : 'No objective documented on this opportunity.';
        p.nextStep  = String.isNotBlank(opp.NextStep)
            ? opp.NextStep.trim()
            : 'Not documented on the opportunity.';

        // ---- Stage position along the org's OWN sales path (describe, not a hardcoded map) ----
        p.stageProgressPct = stagePercent(opp.StageName);

        // ---- Stage age: last StageName change from field history, else age since created ----
        Date stageSince = opp.CreatedDate.date();
        for (OpportunityFieldHistory h : [
            SELECT CreatedDate FROM OpportunityFieldHistory
            WHERE OpportunityId = :oppId AND Field = 'StageName'
            ORDER BY CreatedDate DESC LIMIT 1
        ]) {
            stageSince = h.CreatedDate.date();
        }
        p.daysInStage = stageSince.daysBetween(Date.today());
        p.daysInStageLabel = String.valueOf(p.daysInStage) + ' days in current stage';

        // ---- Close-date slippage: has the close date already been pushed later than first recorded? ----
        Integer slipDays = 0;
        List<OpportunityFieldHistory> cdHist = [
            SELECT OldValue, NewValue FROM OpportunityFieldHistory
            WHERE OpportunityId = :oppId AND Field = 'CloseDate'
            ORDER BY CreatedDate ASC
        ];
        if (!cdHist.isEmpty()) {
            try {
                Date orig = (Date) cdHist[0].get('OldValue');
                Date curr = (Date) cdHist[cdHist.size() - 1].get('NewValue');
                if (orig != null && curr != null && curr > orig) {
                    slipDays = orig.daysBetween(curr);
                }
            } catch (Exception e) {
                slipDays = 0; // non-date history payload -> treat as no slippage
            }
        }

        // ---- Open service cases: count (feeds caption) + list (Activity & Risks drill-down) ----
        // Materiality gate: only High-priority or Type=Problem cases threaten the deal. A routine
        // Account-Support ask (e.g. a beneficiary update) is shown in the drill-down but does NOT
        // drive a readiness deduction, so the card never over-flags harmless service noise.
        Integer totalCases = 0;
        Integer openCases  = 0;
        Integer materialOpenCases = 0;
        String  materialCaseSubject = null;
        p.cases = new List<CaseRow>();
        if (opp.AccountId != null) {
            for (AggregateResult ar : [
                SELECT IsClosed, COUNT(Id) cnt FROM Case
                WHERE AccountId = :opp.AccountId GROUP BY IsClosed
            ]) {
                Integer cnt = (Integer) ar.get('cnt');
                totalCases += cnt;
                if (ar.get('IsClosed') == false) openCases += cnt;
            }
            for (Case c : [
                SELECT Id, CaseNumber, Subject, Type, Status, Priority FROM Case
                WHERE AccountId = :opp.AccountId AND IsClosed = false
                ORDER BY CreatedDate DESC LIMIT 10
            ]) {
                CaseRow cr = new CaseRow();
                cr.caseNumber = c.CaseNumber;
                cr.subject    = c.Subject;
                cr.type       = c.Type;
                cr.status     = c.Status;
                cr.url        = base + '/lightning/r/Case/' + c.Id + '/view';
                p.cases.add(cr);
                Boolean material = (c.Priority == 'High') || (c.Type == 'Problem');
                if (material) {
                    materialOpenCases++;
                    if (materialCaseSubject == null) materialCaseSubject = c.Subject;
                }
            }
        }
        p.openCaseCount = openCases;
        p.casesLabel = totalCases == 0
            ? 'No service cases'
            : totalCases + ' case' + (totalCases == 1 ? '' : 's')
              + (openCases > 0 ? ' · ' + openCases + ' open' : ' · all closed');

        // ---- Last meaningful interaction (most recent completed task or past-dated event) ----
        Date lastDate = null;
        String lastSubject = null;
        for (Task t : [
            SELECT Subject, ActivityDate FROM Task
            WHERE WhatId IN :activityWhatIds AND IsClosed = true AND ActivityDate != null
            ORDER BY ActivityDate DESC LIMIT 1
        ]) {
            lastSubject = t.Subject; lastDate = t.ActivityDate;
        }
        for (Event ev : [
            SELECT Subject, ActivityDate FROM Event
            WHERE WhatId IN :activityWhatIds AND ActivityDate != null AND ActivityDate < :Date.today()
            ORDER BY ActivityDate DESC LIMIT 1
        ]) {
            if (lastDate == null || ev.ActivityDate > lastDate) {
                lastSubject = ev.Subject; lastDate = ev.ActivityDate;
            }
        }
        p.lastTouchLabel = (lastDate != null)
            ? lastSubject + ' · ' + lastDate.format()
            : 'No interactions logged yet';
        Integer inactiveDays = (lastDate == null) ? null : lastDate.daysBetween(Date.today());

        // ---- Next scheduled client meeting (earliest upcoming event) ----
        String nextMeeting = null; Date nextMeetingDate = null;
        for (Event ev : [
            SELECT Subject, ActivityDate FROM Event
            WHERE WhatId IN :activityWhatIds AND ActivityDate >= :Date.today()
            ORDER BY ActivityDate ASC LIMIT 1
        ]) {
            nextMeeting = ev.Subject; nextMeetingDate = ev.ActivityDate;
        }
        p.nextMeetingLabel = (nextMeeting == null)
            ? 'None scheduled'
            : nextMeeting + ' · ' + nextMeetingDate.format();

        // ---- Open action items: open tasks + upcoming events on the deal AND its client account ----
        // "Open" is enforced in SOQL (Task IsClosed = false, Event ActivityDate >= today). Sorted
        // soonest-deadline first. We also capture the single most-overdue task to feed the readiness
        // signal set below.
        p.activities = new List<ActivityRow>();
        String overdueSubject = null; Integer overdueDays = 0;
        for (Task t : [
            SELECT Id, Subject, ActivityDate, Status FROM Task
            WHERE WhatId IN :activityWhatIds AND IsClosed = false
            ORDER BY ActivityDate ASC NULLS LAST LIMIT 15
        ]) {
            ActivityRow a = new ActivityRow();
            a.subject = t.Subject;
            a.type    = 'Task';
            a.dueDate = t.ActivityDate != null ? t.ActivityDate.format() : '';
            a.sortKey = iso(t.ActivityDate);
            Boolean pastDue = t.ActivityDate != null && t.ActivityDate < Date.today();
            a.status  = pastDue ? 'Past due' : t.Status;
            a.url     = base + '/lightning/r/Task/' + t.Id + '/view';
            applyActivityStyle(a, pastDue);
            p.activities.add(a);
            if (pastDue) {
                Integer od = t.ActivityDate.daysBetween(Date.today());
                if (overdueSubject == null || od > overdueDays) { overdueSubject = t.Subject; overdueDays = od; }
            }
        }
        for (Event ev : [
            SELECT Id, Subject, ActivityDate FROM Event
            WHERE WhatId IN :activityWhatIds AND ActivityDate >= :Date.today()
            ORDER BY ActivityDate ASC NULLS LAST LIMIT 15
        ]) {
            ActivityRow a = new ActivityRow();
            a.subject = ev.Subject;
            a.type    = 'Event';
            a.dueDate = ev.ActivityDate != null ? ev.ActivityDate.format() : '';
            a.sortKey = iso(ev.ActivityDate);
            a.status  = 'Upcoming';
            a.url     = base + '/lightning/r/Event/' + ev.Id + '/view';
            applyActivityStyle(a, false);
            p.activities.add(a);
        }
        p.activities.sort(new ActivityComparator());
        if (p.activities.size() > 8) {
            List<ActivityRow> trimmed = new List<ActivityRow>();
            for (Integer i = 0; i < 8; i++) trimmed.add(p.activities[i]);
            p.activities = trimmed;
        }
        p.activitiesLabel = p.activities.isEmpty()
            ? 'No open action items'
            : p.activities.size() + ' open action item' + (p.activities.size() == 1 ? '' : 's');

        // ---- Derive readiness signals, then score + leading risk + What Needs Attention from them ----
        List<RiskSignal> signals = collectSignals(
            p, opp, overdueSubject, overdueDays, slipDays, inactiveDays,
            materialOpenCases, materialCaseSubject
        );
        computeReadiness(p, signals);

        // What Needs Attention: the top three firing signals, as native icon+text rows. No self-
        // referential "prepare for the N items below" step -- that duplicated the Activity list.
        p.recommendedStepList = new List<StepRow>();
        for (Integer i = 0; i < signals.size() && i < 3; i++) {
            p.recommendedStepList.add(step(signals[i].action, signals[i].iconName, signals[i].iconColor));
        }
        if (p.recommendedStepList.isEmpty()) {
            String allClear = String.isNotBlank(opp.NextStep)
                ? 'On track. Next: ' + opp.NextStep.trim()
                : 'On track. Confirm the next milestone with the client to keep momentum.';
            p.recommendedStepList.add(step(allClear, 'check-circle', 'success'));
        }
        // Legacy markdown mirror (kept for the MCP/text channel; the LEX card renders the list natively).
        List<String> md = new List<String>();
        for (StepRow s : p.recommendedStepList) md.add('- ' + s.text);
        p.recommendedSteps = md.isEmpty() ? '' : ('**What needs attention**\n' + String.join(md, '\n'));

        p.dealSnapshot = buildDealSnapshot(p, opp);

        return p;
    }

    /**
     * A derived readiness signal. `rank` orders signals by urgency (lower = more urgent): the top-ranked
     * firing signal becomes the Leading Risk and the top three become the What-Needs-Attention actions.
     * `penalty` is the readiness deduction. `risk` phrases the concern; `action` phrases the fix.
     */
    private class RiskSignal {
        Integer rank;
        Integer penalty;
        String  risk;         // consequence phrasing for the Leading Risk banner (no task title)
        String  action;       // consequence-framed action for What Needs Attention (no task title)
        String  deductLabel;  // short label for the readiness-breakdown line, e.g. "overdue follow-up"
        String  iconName;
        String  iconColor;
        RiskSignal(Integer rank, Integer penalty, String risk, String action, String deductLabel, String iconName, String iconColor) {
            this.rank = rank; this.penalty = penalty; this.risk = risk; this.action = action;
            this.deductLabel = deductLabel; this.iconName = iconName; this.iconColor = iconColor;
        }
    }

    private class RiskSignalComparator implements Comparator<RiskSignal> {
        public Integer compare(RiskSignal a, RiskSignal b) {
            return a.rank < b.rank ? -1 : (a.rank > b.rank ? 1 : 0);
        }
    }

    /**
     * Collect the readiness signals that are actually firing for THIS deal, from real/derived data only.
     * Ranked by urgency. Deliberately NO win-probability penalty: a low probability at an early stage is
     * coherent, not a risk, so it is context (shown as a fact box) rather than a deduction.
     */
    private static List<RiskSignal> collectSignals(
        DealProfile p, Opportunity opp, String overdueSubject, Integer overdueDays,
        Integer slipDays, Integer inactiveDays, Integer materialOpenCases, String materialCaseSubject
    ) {
        List<RiskSignal> signals = new List<RiskSignal>();

        // Each signal carries: the CONSEQUENCE (risk banner), a consequence-framed ACTION (What Needs
        // Attention -- deliberately NOT the task title, which lives in Action Items), and a short
        // deductLabel for the readiness breakdown. Task/case titles stay out of these strings so the
        // attention section never restates Action Items verbatim.

        // 1. Open deal already past its close date (most urgent).
        if (!opp.IsClosed && opp.CloseDate != null && opp.CloseDate < Date.today()) {
            Integer d = Math.abs(p.daysToClose);
            signals.add(new RiskSignal(10, 25,
                'Close date has passed with the deal still open',
                'Re-baseline the close date: the committed date is ' + d + ' day' + (d == 1 ? '' : 's') + ' in the past.',
                'past close date', 'calendar', 'error'));
        }
        // 2. Overdue open activity. Leading Risk states the CONSEQUENCE (the decision/next step is
        // unconfirmed); the action names the ACTUAL task so the two never read as the same sentence.
        if (overdueSubject != null) {
            signals.add(new RiskSignal(20, 20,
                'The decision timeline remains unconfirmed',
                'Complete the overdue "' + overdueSubject + '" task.',
                'overdue follow-up', 'clock', 'error'));
        }
        // 2b. Documented next step with no meeting on the calendar -> surface the concrete next move.
        // Penalty 0: this is an obvious action to promote, not itself a readiness deduction, so it
        // shows in What Needs Attention without changing the score or the breakdown line.
        Boolean noMeeting = String.isBlank(p.nextMeetingLabel) || p.nextMeetingLabel == 'None scheduled';
        if (noMeeting && String.isNotBlank(opp.NextStep)) {
            signals.add(new RiskSignal(25, 0,
                'No meeting is on the calendar to move the deal forward',
                nextStepAction(opp.NextStep),
                null, 'calendar', 'primary'));
        }
        // 3. Stalled in stage.
        if (p.daysInStage != null && p.daysInStage > STALE_STAGE_DAYS * 2) {
            signals.add(new RiskSignal(30, 40,
                'Deal has stalled ' + p.daysInStage + ' days in ' + p.stageName,
                'Advance the deal out of ' + p.stageName + ': agree the next milestone with the client.',
                'stalled in stage', 'trending-up', 'warning'));
        } else if (p.daysInStage != null && p.daysInStage > STALE_STAGE_DAYS) {
            signals.add(new RiskSignal(31, 25,
                'Deal has stalled ' + p.daysInStage + ' days in ' + p.stageName,
                'Advance the deal out of ' + p.stageName + ': agree the next milestone with the client.',
                'stalled in stage', 'trending-up', 'warning'));
        }
        // 4. Close-date slippage (the date has already been pushed later).
        if (slipDays != null && slipDays > 0) {
            signals.add(new RiskSignal(40, 15,
                'Close date has already slipped ' + slipDays + ' days',
                'Confirm the revised timeline is real before you forecast to it.',
                'close-date slippage', 'calendar', 'warning'));
        }
        // 5. Forecast inconsistency: real money past the mid-point still parked in an early category.
        String fc = opp.ForecastCategoryName;
        if (opp.Amount != null && opp.Amount > 0 && (fc == 'Omitted' || fc == 'Pipeline')
            && p.stageProgressPct != null && p.stageProgressPct >= 50) {
            signals.add(new RiskSignal(50, 10,
                'Forecast category understates a mid-stage ' + p.amount + ' deal',
                'Update the forecast category: this deal is past the mid-point but still sits in ' + fc + '.',
                'forecast inconsistency', 'activity', 'warning'));
        }
        // 6. MATERIAL open service cases only (High priority or Type=Problem). Routine service asks
        // (e.g. a beneficiary update) are excluded here -- they show in the drill-down but do not
        // deduct readiness or clutter What Needs Attention.
        if (materialOpenCases != null && materialOpenCases > 0) {
            String detail = (materialOpenCases == 1 && String.isNotBlank(materialCaseSubject))
                ? 'Resolve the high-priority case "' + materialCaseSubject + '" before it stalls the deal.'
                : 'Resolve the ' + materialOpenCases + ' high-priority service cases before they stall the deal.';
            signals.add(new RiskSignal(60, Math.min(20, materialOpenCases * 10),
                'A high-priority service issue could sour the relationship mid-deal',
                detail,
                'high-priority service case' + (materialOpenCases == 1 ? '' : 's'), 'activity', 'warning'));
        }
        // 7. Inactivity: no logged touch recently (or none at all).
        if (inactiveDays == null) {
            signals.add(new RiskSignal(70, 15,
                'No client engagement is recorded on this deal',
                'Log a client touch to establish momentum on this deal.',
                'no logged activity', 'clock', 'warning'));
        } else if (inactiveDays > INACTIVE_DAYS) {
            signals.add(new RiskSignal(70, 15,
                'The client has gone quiet for ' + inactiveDays + ' days',
                'Re-engage the client: the last logged interaction was ' + inactiveDays + ' days ago.',
                'client inactivity', 'clock', 'warning'));
        }
        // 8. Missing next step.
        if (String.isBlank(opp.NextStep)) {
            signals.add(new RiskSignal(80, 10,
                'The deal has no documented path forward',
                'Document the next step so the deal has a clear path forward.',
                'missing next step', 'activity', 'primary'));
        }

        signals.sort(new RiskSignalComparator());
        return signals;
    }

    // ---- deal-readiness scoring: start at 100, subtract firing-signal penalties, clamp, then band ----
    private static void computeReadiness(DealProfile p, List<RiskSignal> signals) {
        Integer score = 100;
        for (RiskSignal s : signals) score -= s.penalty;
        if (score < 0) score = 0;
        if (score > 100) score = 100;
        p.dealHealthScore = score;

        // Bands. healthVariant drives the callout banner (success / warning / error all tint on LEX).
        if (score >= 80) {
            p.dealHealthLabel = 'On track';
            p.healthColor     = 'success';
            p.healthVariant   = 'success';
        } else if (score >= 60) {
            p.dealHealthLabel = 'Attention needed';
            p.healthColor     = 'warning';
            p.healthVariant   = 'warning';
        } else {
            p.dealHealthLabel = 'At risk';
            p.healthColor     = 'warning';
            p.healthVariant   = 'error';
        }

        // Status label leads (more meaningful than the number); score is secondary context.
        p.healthHeadline = 'Deal Readiness: ' + p.dealHealthLabel + ' · ' + score + '/100';

        // Leading Risk = the single highest-ranked firing signal, labelled as the user requested.
        p.leadingRisk = signals.isEmpty() ? null : signals[0].risk;

        // Plain-language explanation of what drives the score -- no scoring arithmetic on the banner.
        // Lists the firing factors as prose ("an overdue follow-up and a high-priority service case")
        // then names the leading risk. Highest-impact factor first.
        if (signals.isEmpty()) {
            p.healthReasons = 'No risk signals are firing on this deal.';
        } else {
            List<RiskSignal> byImpact = signals.clone();
            byImpact.sort(new RiskSignalPenaltyComparator());
            List<String> factors = new List<String>();
            for (RiskSignal s : byImpact) {
                if (s.penalty > 0 && String.isNotBlank(s.deductLabel)) {
                    factors.add(withArticle(s.deductLabel));
                }
            }
            String lead = String.isBlank(p.leadingRisk)
                ? ''
                : ' Leading risk: ' + p.leadingRisk.substring(0, 1).toLowerCase() + p.leadingRisk.substring(1) + '.';
            p.healthReasons = factors.isEmpty()
                ? ('Leading risk: ' + p.leadingRisk + '.')
                : ('Driven by ' + naturalJoin(factors) + '.' + lead);
        }
    }

    // Prefixes a/an by first letter so a deductLabel reads as prose ("an overdue follow-up").
    private static String withArticle(String label) {
        String l = label.trim();
        Boolean vowel = 'aeiou'.contains(l.substring(0, 1).toLowerCase());
        return (vowel ? 'an ' : 'a ') + l;
    }

    // Joins phrases with commas and a trailing "and": [a] -> "a"; [a,b] -> "a and b"; [a,b,c] -> "a, b and c".
    private static String naturalJoin(List<String> items) {
        if (items.size() == 1) return items[0];
        if (items.size() == 2) return items[0] + ' and ' + items[1];
        List<String> head = new List<String>();
        for (Integer i = 0; i < items.size() - 1; i++) head.add(items[i]);
        return String.join(head, ', ') + ' and ' + items[items.size() - 1];
    }

    // Orders signals by penalty descending so the readiness breakdown leads with the biggest deduction.
    private class RiskSignalPenaltyComparator implements Comparator<RiskSignal> {
        public Integer compare(RiskSignal a, RiskSignal b) {
            if (a.penalty == b.penalty) return a.rank - b.rank;
            return b.penalty - a.penalty;
        }
    }

    /**
     * Deal-scoped snapshot. Frames the anchor deal: its size, stage, close timing, readiness, and the
     * derived leading risk. Every figure traces to a queried record, so the narrative changes per deal.
     */
    private static String buildDealSnapshot(DealProfile p, Opportunity opp) {
        List<String> lines = new List<String>();

        String opener = '**' + p.oppName + '**'
            + (String.isNotBlank(p.accountName) ? ' for **' + p.accountName + '**' : '')
            + ' is a **' + p.amount + '** deal in **' + p.stageName + '**';
        if (String.isNotBlank(p.closeDate)) {
            opener += ', closing **' + p.closeDate + '**';
            if (p.daysToClose != null) {
                opener += p.daysToClose >= 0
                    ? ' (' + p.daysToClose + ' days out)'
                    : ' (**' + Math.abs(p.daysToClose) + ' days past due**)';
            }
        }
        opener += '.';
        lines.add(opener);

        String readinessLine = 'Deal Readiness **' + p.dealHealthLabel + '** (' + p.dealHealthScore + '/100)';
        readinessLine += String.isBlank(p.leadingRisk)
            ? ': no blocking risk signals.'
            : '. Leading risk: ' + p.leadingRisk + '.';
        lines.add(readinessLine);

        return String.join(lines, ' ');
    }

    // ---- helpers ----

    // Turns a free-text NextStep into a single obvious imperative for What Needs Attention.
    // Keeps only the first sentence/clause so the action stays punchy (the full text lives under
    // Deal Strategy > Next Step). Prefixes an action verb only when the text does not already lead
    // with one, so "Schedule investment risk assessment meeting..." passes through clean.
    private static String nextStepAction(String nextStep) {
        String s = nextStep.trim();
        // First sentence only.
        Integer dot = s.indexOf('.');
        if (dot > 0) s = s.substring(0, dot).trim();
        // Split a compound "X and Y" down to the first, most concrete move.
        Integer andIdx = s.toLowerCase().indexOf(' and ');
        if (andIdx > 0) s = s.substring(0, andIdx).trim();
        String lower = s.toLowerCase();
        Set<String> verbs = new Set<String>{
            'schedule', 'send', 'prepare', 'confirm', 'follow', 'review', 'call', 'draft', 'set', 'book', 'complete'
        };
        Boolean startsWithVerb = false;
        for (String v : verbs) { if (lower.startsWith(v)) { startsWithVerb = true; break; } }
        if (!startsWithVerb) {
            s = 'Move forward: ' + s.substring(0, 1).toLowerCase() + s.substring(1);
        } else {
            s = s.substring(0, 1).toUpperCase() + s.substring(1);
        }
        return s.endsWith('.') ? s : s + '.';
    }

    // Condenses the objective so it does not repeat the amount/deal concept shown in the header.
    // If the first sentence mentions the deal amount, drop it and keep the rest (the "seeking..."
    // detail). Falls back to the full text when there is nothing redundant to trim.
    private static String condenseObjective(String description, Decimal amount) {
        String full = description.trim();
        List<String> sentences = full.split('(?<=\\.)\\s+');
        if (sentences.size() <= 1) return full;
        String first = sentences[0];
        Boolean firstEchoesAmount = amount != null
            && (first.contains(String.valueOf(amount.intValue()))
                || first.containsIgnoreCase('$8.5m')
                || first.containsIgnoreCase('portfolio expansion'));
        if (firstEchoesAmount) {
            List<String> rest = new List<String>();
            for (Integer i = 1; i < sentences.size(); i++) rest.add(sentences[i]);
            String trimmed = String.join(rest, ' ').trim();
            if (String.isNotBlank(trimmed)) return trimmed;
        }
        return full;
    }

    // Small helper to build a StepRow inline.
    private static StepRow step(String text, String iconName, String iconColor) {
        StepRow s = new StepRow();
        s.text = text;
        s.iconName = iconName;
        s.iconColor = iconColor;
        return s;
    }

    // Sorts action items by due date ASCENDING (soonest deadline first). Null dates sink to the bottom.
    global class ActivityComparator implements Comparator<ActivityRow> {
        public Integer compare(ActivityRow a, ActivityRow b) {
            if (a.sortKey == b.sortKey) return 0;
            if (a.sortKey == null) return 1;
            if (b.sortKey == null) return -1;
            return a.sortKey < b.sortKey ? -1 : 1;
        }
    }

    // ISO yyyy-MM-dd (sorts lexically = chronologically). Null-safe.
    private static String iso(Date d) {
        if (d == null) return null;
        return DateTime.newInstance(d.year(), d.month(), d.day()).formatGmt('yyyy-MM-dd');
    }

    // Map an action item's status to the tile/icon color + tile/badge variant enums. Overdue = error,
    // upcoming/in-progress = warning, else neutral.
    private static void applyActivityStyle(ActivityRow a, Boolean pastDue) {
        String s = a.status == null ? '' : a.status.toLowerCase();
        if (pastDue || s == 'past due') {
            a.statusColor = 'error';   a.statusVariant = 'error';
        } else if (s == 'completed') {
            a.statusColor = 'success'; a.statusVariant = 'success';
        } else if (s == 'in progress' || s == 'upcoming') {
            a.statusColor = 'warning'; a.statusVariant = 'warning';
        } else {
            a.statusColor = 'muted';   a.statusVariant = 'outline';
        }
    }

    // Current stage's position (1-based) across the ACTIVE StageName picklist entries, as a 0-100
    // percent. Reads the org's own picklist order via describe so no sales path is hardcoded.
    private static Decimal stagePercent(String stageName) {
        if (String.isBlank(stageName)) return 0;
        List<Schema.PicklistEntry> entries = Opportunity.StageName.getDescribe().getPicklistValues();
        List<String> active = new List<String>();
        for (Schema.PicklistEntry pe : entries) {
            if (pe.isActive()) active.add(pe.getValue());
        }
        Integer total = active.size();
        for (Integer i = 0; i < total; i++) {
            if (active[i] == stageName) {
                return total > 0 ? (Decimal.valueOf(i + 1) / total * 100).setScale(0) : 0;
            }
        }
        return 0;
    }

    private static String usd(Decimal amount) {
        if (amount == null) amount = 0;
        String s = String.valueOf(amount.setScale(0).longValue());
        Boolean neg = s.startsWith('-');
        if (neg) s = s.substring(1);
        String out = '';
        Integer count = 0;
        for (Integer i = s.length() - 1; i >= 0; i--) {
            out = s.substring(i, i + 1) + out;
            count++;
            if (Math.mod(count, 3) == 0 && i > 0) {
                out = ',' + out;
            }
        }
        return (neg ? '-$' : '$') + out;
    }
}
