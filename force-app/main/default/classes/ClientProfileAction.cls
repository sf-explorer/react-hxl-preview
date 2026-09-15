/**
 * ClientProfileAction
 * HXL MCP invocable action: returns a wealth client's RELATIONSHIP-HUB payload shaped to the
 * clientProfileCard widget attribute contract.
 *
 * Design note (rejig 2026-08-28): the Client Profile Card is now the relationship hub of a
 * two-card pair. Deal-level detail lives on the Opportunity Card; this card carries the whole
 * household story: identity, net position, the household's open pipeline + lifetime won, goal
 * funding, the household roster, open action items across the household, financial accounts, and
 * service cases across the household. Its button CHAINS into the Opportunity Card by asking for a
 * deal review of the household's single largest open deal (resolved server-side, not by the LLM).
 *
 * Scope rule: "household/account" = the client's own person account PLUS every other member
 * account in the same FSC household group. Rollups (pipeline, won, action items, cases, largest
 * deal) span that member-account set; goals + financial accounts stay client/family-scoped.
 *
 * Standard/FSC objects only: Account, AccountContactRelation, FinancialPlan, FinancialGoal,
 * FinancialAccount, Opportunity, Case, Task, Event, PersonLifeEvent. No FinServ custom __c beyond
 * the standard FSC objects above.
 *
 * The single @InvocableVariable field name (clientProfile) is the binding anchor that must stay
 * byte-identical across the payload CLT, the GenAiFunction output, and the renderer path
 * ({!$attrs.outputValues.clientProfile.<field>}).
 */
global with sharing class ClientProfileAction {

    // Max characters for a link-column label before it is ellipsized. HXL table link cells never
    // wrap, so the single longest cell sets the whole card's width; on the narrow LEX/AEA panel
    // that overflows and clips columns. A character budget is the only lever an invocable has (no
    // viewport is passed). Tune to the widest label the narrowest surface (LEX panel) shows clean.
    private static final Integer LINK_LABEL_MAX = 32;

    // ---- Invocable input ----
    global class Request {
        @InvocableVariable(label='Client Account Id or Name' description='The wealth client to profile: either a 15-/18-character Person Account Id (LEX passes this from the record) or the client\'s name (Slackbot/Claude callers can just say the name). If omitted, the card renders a "name a client" prompt rather than guessing. No client is chosen for you.' required=false)
        global String recordId;
    }

    // ---- Invocable response wrapper ----
    global class ClientProfileResponse {
        @InvocableVariable global ClientProfile clientProfile;
    }

    // ---- Payload returned to the MCP tool / mapped onto the widget ----
    global class ClientProfile {
        // ---- identity (header: avatar + name + title + segment badge) ----
        @InvocableVariable global String clientName;
        @InvocableVariable global String clientInitials;  // 2-char avatar initials
        @InvocableVariable global String clientTitle;
        @InvocableVariable global String segment;

        // ---- 3 stat boxes: net position ----
        @InvocableVariable global String investableAssets;
        @InvocableVariable global String mortgageOutstanding;
        @InvocableVariable global String netWorth;              // investable minus mortgage, formatted

        // ---- 2 stat boxes: relationship value band (household-scoped rollup) ----
        @InvocableVariable global String  relationshipPipeline;    // formatted $, sum of OPEN opps across household
        @InvocableVariable global Decimal relationshipPipelineRaw;
        @InvocableVariable global String  wonLifetime;             // formatted $, sum of WON opps across household
        @InvocableVariable global Decimal wonLifetimeRaw;
        @InvocableVariable global Integer openOppCount;            // count of open opps across household

        // ---- overview narrative (rendered as markdown) ----
        @InvocableVariable global String advisorSnapshot;
        // advisorName + householdName feed the snapshot narrative (rendered indirectly), not shown raw.
        @InvocableVariable global String advisorName;
        @InvocableVariable global String householdName;

        // ---- 4 goal doughnuts ----
        @InvocableVariable global List<Goal> goals;

        // ---- Plan & Portfolio: true asset-class allocation (% of portfolio market value) ----
        // Summed from SecuritiesHolding.AssetClass x MarketValue across the household's in-scope
        // investment accounts -- a real asset-class breakdown (Equities / Fixed Income / Cash /
        // Alternatives / Other), NOT the account wrapper. showAllocation gates the whole subsection.
        @InvocableVariable global List<AllocationRow> allocation;
        @InvocableVariable global Boolean showAllocation;

        // ---- Activity & Follow-Up: recent material changes (<=3) ----
        // Derived from record STATE (recently closed deals, resolved / high-priority cases), not from a
        // "last review" date -- the demo data carries no per-record review anchor. showRecentChanges
        // gates the subsection so it disappears when nothing material is present.
        @InvocableVariable global List<RecentChangeRow> recentChanges;
        @InvocableVariable global Boolean showRecentChanges;

        // ---- Advisor Priorities: <=3 actionable items surfaced above the fold ----
        @InvocableVariable global List<AttentionItemRow> attentionItems;
        @InvocableVariable global Boolean showAttentionItems;

        // ---- household accordion (roster + avatar cluster) ----
        @InvocableVariable global List<Member> household;
        @InvocableVariable global Integer householdCount;    // drives the avatar cluster
        @InvocableVariable global String  householdOverflow; // "+N" bubble when household exceeds the shown avatars

        // ---- action items accordion (OPEN tasks + upcoming events across the household) ----
        @InvocableVariable global List<ActionItemRow> actionItems;

        // ---- financial accounts table ----
        @InvocableVariable global List<AccountRow> accounts;

        // ---- service cases table (household-scoped, paginated) ----
        @InvocableVariable global List<CaseRow> cases;

        // ---- chaining button: the household's single largest OPEN deal (server-resolved) ----
        // largestOpenDealId is the 18-char Opportunity Id the chaining button hands to
        // Get_Opportunity_Profile.recordId. That action's fallback is ORG-WIDE (largest open
        // deal across the whole org), so passing the household-scoped Id here is what keeps the
        // Deal Card on THIS client's deal instead of some unrelated bigger org opportunity.
        @InvocableVariable global String largestOpenDealId;
        @InvocableVariable global String largestOpenDealName;

        // ---- deep-link CTAs (tile/link href targets; navigation only) ----
        @InvocableVariable global String recordUrl;     // open the client record
        @InvocableVariable global String householdUrl;  // open the household group
    }

    // Ranks FinancialGoals by funding fraction (ActualAmount/TargetAmount) DESC so the donut row can
    // show the best-funded goals first. Goals with no/zero target sort to the bottom (fraction 0).
    global class GoalFundingComparator implements Comparator<FinancialGoal> {
        public Integer compare(FinancialGoal a, FinancialGoal b) {
            Decimal fa = fraction(a);
            Decimal fb = fraction(b);
            if (fa == fb) return 0;
            return fa > fb ? -1 : 1;
        }
        private Decimal fraction(FinancialGoal g) {
            Decimal target = g.TargetAmount == null ? 0 : g.TargetAmount;
            Decimal actual = g.ActualAmount == null ? 0 : g.ActualAmount;
            return target > 0 ? actual / target : 0;
        }
    }

    // Sorts action items by due date ASCENDING (soonest deadline first, the useful order for a
    // to-do list). Null dates sink to the bottom.
    global class ActionItemComparator implements Comparator<ActionItemRow> {
        public Integer compare(ActionItemRow a, ActionItemRow b) {
            if (a.sortKey == b.sortKey) return 0;
            if (a.sortKey == null) return 1;
            if (b.sortKey == null) return -1;
            return a.sortKey < b.sortKey ? -1 : 1;   // ascending
        }
    }

    global class Goal {
        @InvocableVariable global String name;
        @InvocableVariable global Decimal pct;
        @InvocableVariable global String color; // progress-ring color by funding level (success/warning)
        @InvocableVariable global String url;   // deep link to the FinancialGoal record
        // Pre-composed donut caption ("Retirement Fund: $658,904 (33%)"), built in Apex so the widget
        // renders one plain string instead of concatenating name/pct/amount inside a text interpolation.
        @InvocableVariable global String captionLabel;
    }

    global class Member {
        @InvocableVariable global String name;
        @InvocableVariable global String role;      // ACR Roles (Client / Spouse / Dependent ...)
        @InvocableVariable global String initials;  // 2-char avatar initials from the member name
        @InvocableVariable global String url;       // deep link to the member Contact
    }

    global class ActionItemRow {
        @InvocableVariable global String subject;
        @InvocableVariable global String type;          // "Task" / "Event"
        @InvocableVariable global String dueDate;       // formatted for display
        @InvocableVariable global String status;        // Task status, "Past due", or "Upcoming"
        @InvocableVariable global String statusColor;   // tile/icon color enum: success / warning / error / muted
        @InvocableVariable global String statusVariant; // tile/badge variant enum: success / warning / error / outline
        @InvocableVariable global String sortKey;       // ISO yyyy-MM-dd; latent, sorts chronologically
        @InvocableVariable global String url;
    }

    global class AccountRow {
        @InvocableVariable global String name;
        @InvocableVariable global String type;
        @InvocableVariable global Decimal balance;
        @InvocableVariable global String url; // deep link to the FinancialAccount record
    }

    global class AllocationRow {
        @InvocableVariable global String  asset;        // asset class (Equities / Fixed Income / Cash / Alternatives / Other)
        @InvocableVariable global Decimal actual;       // market value in that class (latent; caption carries the display $)
        @InvocableVariable global Decimal pct;          // percent of total portfolio market value (drives the bar)
        @InvocableVariable global String  captionLabel; // "Equities: $2,623,670 (94%)"
    }

    global class RecentChangeRow {
        @InvocableVariable global String title;  // headline of the change
        @InvocableVariable global String detail; // one-line context
        @InvocableVariable global String dateLabel; // short label ("Recent"); demo data has no review anchor ("date" is a reserved Apex word)
    }

    global class AttentionItemRow {
        @InvocableVariable global String title;         // actionable headline
        @InvocableVariable global String detail;        // one-line why
        @InvocableVariable global String statusLabel;   // short badge label
        @InvocableVariable global String statusVariant; // tile/badge variant enum
    }

    global class CaseRow {
        @InvocableVariable global String subject;
        @InvocableVariable global String status;
        @InvocableVariable global String priority;
        @InvocableVariable global String url; // deep link to the Case record
    }

    @InvocableMethod(label='Get Client Profile' description='Returns a wealth client relationship-hub payload for the clientProfileCard HXL widget. Pass recordId as either a Person Account Id (LEX supplies this from the record) or the client\'s name (name-based callers like Slackbot/Claude). With no input the card renders a "name a client" prompt; it never guesses a client for you.')
    global static List<ClientProfileResponse> getClientProfile(List<Request> requests) {
        ClientProfileResponse res = new ClientProfileResponse();
        res.clientProfile = build(resolveClientId(requests));

        List<ClientProfileResponse> results = new List<ClientProfileResponse>();
        results.add(res);
        return results;
    }

    // Resolve the client the caller asked for -- by Id or by name, most-specific first -- with NO
    // baked-in default. This card is a generic showcase component: the demo admin decides which
    // record to profile in their org (LEX passes the record Id from context; name-based callers say
    // the client's name). When nothing usable is passed we return null so build() renders a friendly
    // "name a client" state instead of the code silently choosing a record on the admin's behalf.
    //   1. a valid 15-/18-char Id  -> use it directly (the LEX record path)
    //   2. an exact Name match     -> the client the caller named (a Person Account)
    //   3. a partial Name match    -> tolerate LLM paraphrase / partial names
    //   4. nothing usable          -> null (empty-state card)
    private static Id resolveClientId(List<Request> requests) {
        String raw = (requests != null && !requests.isEmpty()) ? requests[0].recordId : null;
        if (String.isBlank(raw)) return null;
        String term = raw.trim();

        // 1. valid Id -> use as-is
        try {
            return Id.valueOf(term);
        } catch (System.StringException e) {
            // not an Id -> treat as a client name below
        }

        // 2. exact name match, restricted to Person Accounts (this card profiles a person/household)
        List<Account> exact = [
            SELECT Id FROM Account
            WHERE Name = :term AND IsPersonAccount = true
            ORDER BY CreatedDate ASC LIMIT 1
        ];
        if (!exact.isEmpty()) return exact[0].Id;

        // 3. partial name match (LLM may paraphrase or send only a first/last name)
        List<Account> partial = [
            SELECT Id FROM Account
            WHERE Name LIKE :('%' + term + '%') AND IsPersonAccount = true
            ORDER BY CreatedDate ASC LIMIT 1
        ];
        return partial.isEmpty() ? null : partial[0].Id;
    }

    private static ClientProfile build(Id recordId) {
        ClientProfile p = new ClientProfile();
        p.goals          = new List<Goal>();
        p.household      = new List<Member>();
        p.actionItems    = new List<ActionItemRow>();
        p.accounts       = new List<AccountRow>();
        p.cases          = new List<CaseRow>();
        p.allocation     = new List<AllocationRow>();
        p.recentChanges  = new List<RecentChangeRow>();
        p.attentionItems = new List<AttentionItemRow>();

        // My Domain base, resolved at runtime (never hardcoded); used for every deep link below.
        String base = URL.getOrgDomainUrl().toExternalForm();

        // Empty state: no client was named (or the name/Id matched nothing). This card picks no
        // record on its own -- the demo admin points it at a client -- so render a friendly prompt
        // instead of throwing. List query (not single-row) so a null/unmatched Id can't QueryException.
        List<Account> found = (recordId == null) ? new List<Account>() : [
            SELECT Id, Name, FirstName, LastName, PersonTitle, PersonContactId, Owner.Name
            FROM Account WHERE Id = :recordId LIMIT 1
        ];
        if (found.isEmpty()) {
            p.clientName      = 'Name a client to profile';
            p.clientInitials  = '?';
            p.clientTitle     = 'No client selected';
            p.segment         = '';
            p.advisorSnapshot = 'Ask for a specific client by name (or open this card from a client record) to see their relationship profile.';
            return p;
        }
        Account acct = found[0];

        p.clientName     = acct.Name;
        p.clientInitials = initials(acct.FirstName, acct.LastName, acct.Name);
        p.clientTitle    = String.isBlank(acct.PersonTitle) ? 'Wealth Client' : acct.PersonTitle;
        p.segment        = 'High Net Worth';
        p.advisorName    = acct.Owner != null ? acct.Owner.Name : '';
        p.recordUrl      = base + '/lightning/r/Account/' + recordId + '/view';

        // ---- Household: resolve the household ACCOUNT via the person contact, then its members ----
        // TRAP 1: querying AccountContactRelation by the PERSON account id returns 0 rows; the
        // household is a SEPARATE account. TRAP 2: a decoy account with the same "<Family> Household"
        // name can exist, so we NEVER resolve by name -- only PersonContactId -> ACR.AccountId.
        Id householdId = null;
        Set<Id> memberContactIds = new Set<Id>();
        if (acct.PersonContactId != null) {
            memberContactIds.add(acct.PersonContactId);
            for (AccountContactRelation acr : [
                SELECT AccountId, Account.Name FROM AccountContactRelation
                WHERE ContactId = :acct.PersonContactId AND IsActive = true
                ORDER BY CreatedDate ASC LIMIT 1
            ]) {
                householdId = acr.AccountId;
                p.householdName = acr.Account.Name;
            }
        }
        if (householdId != null) {
            for (AccountContactRelation m : [
                SELECT ContactId, Contact.Name, Roles FROM AccountContactRelation
                WHERE AccountId = :householdId AND IsActive = true
                ORDER BY Contact.Name
            ]) {
                Member mem = new Member();
                mem.name     = clamp(m.Contact != null ? m.Contact.Name : '', LINK_LABEL_MAX);
                mem.role     = String.isNotBlank(m.Roles) ? m.Roles.replace(';', ', ') : '';
                mem.initials = toInitials(mem.name);
                mem.url      = m.ContactId != null ? base + '/lightning/r/Contact/' + m.ContactId + '/view' : '';
                p.household.add(mem);
                if (m.ContactId != null) memberContactIds.add(m.ContactId);
            }
        }
        p.householdCount = p.household.size();
        p.householdOverflow = p.household.size() > 4 ? '+' + (p.household.size() - 4) : '';

        // ---- Member accounts: the person accounts behind the household contacts ----
        // The client's account is always in scope; add every other member's person account so the
        // pipeline / won / action-item / case rollups below span the whole household, not one person.
        Set<Id> memberAccountIds = new Set<Id>{ recordId };
        for (Account a : [
            SELECT Id FROM Account WHERE PersonContactId IN :memberContactIds
        ]) {
            memberAccountIds.add(a.Id);
        }

        // ---- Relationship value band + largest open deal (rollup across member accounts) ----
        Decimal openSum = 0;
        Decimal wonSum  = 0;
        Integer openCnt = 0;
        Decimal largestOpenAmt = null;
        // Largest won deal (name + amount) -> feeds a "recent change" row below.
        String  topWonName = null;
        Decimal topWonAmt  = null;
        List<Id> activityWhatIds = new List<Id>(memberAccountIds);
        for (Opportunity o : [
            SELECT Id, Name, Amount, IsClosed, IsWon
            FROM Opportunity WHERE AccountId IN :memberAccountIds
            ORDER BY Amount DESC NULLS LAST
        ]) {
            activityWhatIds.add(o.Id);
            if (!o.IsClosed) {
                openSum += (o.Amount == null ? 0 : o.Amount);
                openCnt++;
                // First open opp in an Amount-DESC scan is the largest; keep its FULL name (unclamped)
                // so the chaining prompt matches the real deal exactly.
                if (largestOpenAmt == null && o.Amount != null) {
                    largestOpenAmt = o.Amount;
                    p.largestOpenDealId   = o.Id;
                    p.largestOpenDealName = o.Name;
                }
            }
            if (o.IsWon) {
                wonSum += (o.Amount == null ? 0 : o.Amount);
                // Amount-DESC scan -> first won opp is the largest won.
                if (topWonName == null) {
                    topWonName = o.Name;
                    topWonAmt  = o.Amount;
                }
            }
        }
        p.relationshipPipelineRaw = openSum;
        p.relationshipPipeline    = usd(openSum);
        p.wonLifetimeRaw          = wonSum;
        p.wonLifetime             = usd(wonSum);
        p.openOppCount            = openCnt;

        // ---- Household scoping for name-matched FinancialAccounts ----
        // FinancialAccount has NO client/party linkage in this org (OwnerId is the advisor User; no
        // owner-to-client lookup and the FSC FinancialAccountRole junction doesn't exist here), so the
        // account NAME is the only tie to a family. A bare surname LIKE would sweep in SAME-SURNAME
        // people OUTSIDE this household. Guard: drop any account whose name carries a non-household
        // member's first name. Names shared with a household member (e.g. two 'Priya's) can't be
        // disambiguated by name, so they default to IN-scope rather than being wrongly excluded.
        String surname = acct.LastName != null ? acct.LastName : '';
        String likeKey = '%' + surname + '%';
        Set<String> hhFirstNames = new Set<String>();
        for (Account a : [SELECT FirstName FROM Account WHERE Id IN :memberAccountIds AND FirstName != null]) {
            hhFirstNames.add(a.FirstName.toLowerCase());
        }
        Set<String> outsiderFirstNames = new Set<String>();
        for (Account a : [
            SELECT FirstName FROM Account
            WHERE LastName = :surname AND IsPersonAccount = true
              AND Id NOT IN :memberAccountIds AND FirstName != null
        ]) {
            outsiderFirstNames.add(a.FirstName.toLowerCase());
        }
        outsiderFirstNames.removeAll(hhFirstNames);

        // ---- Financial accounts (name-matched to the household, only balance-bearing) ----
        Decimal investable = 0;
        Decimal mortgageOut = 0;
        Set<Id> investmentFaIds = new Set<Id>();   // in-scope investment accounts -> holdings aggregate
        for (FinancialAccount fa : [
            SELECT Id, Name, Type, PrincipalAmount, TotalOutstandingAmount
            FROM FinancialAccount
            WHERE Name LIKE :likeKey AND PrincipalAmount != null
            ORDER BY PrincipalAmount DESC
        ]) {
            if (containsOutsider(fa.Name, outsiderFirstNames)) continue;   // same surname, different household
            AccountRow row = new AccountRow();
            row.name    = clamp(fa.Name, LINK_LABEL_MAX);
            row.type    = fa.Type;
            row.balance = fa.PrincipalAmount;
            row.url     = base + '/lightning/r/FinancialAccount/' + fa.Id + '/view';
            p.accounts.add(row);
            if (fa.Type == 'Investment Account') {
                investable += fa.PrincipalAmount;
                investmentFaIds.add(fa.Id);
            }
            if (fa.Type == 'Mortgage' && fa.TotalOutstandingAmount != null) {
                mortgageOut += fa.TotalOutstandingAmount;
            }
        }
        p.investableAssets    = usd(investable);
        p.mortgageOutstanding = usd(mortgageOut);
        p.netWorth            = usd(investable - mortgageOut);

        // ---- Asset allocation: TRUE asset-class mix from SecuritiesHolding.AssetClass ----
        // The prior version inferred class from the account NAME, but "Retirement"/"Education" are
        // account wrappers, not asset classes. FSC's SecuritiesHolding carries a real AssetClass
        // picklist + MarketValue per holding, so allocation is summed from actual holdings and
        // expressed as % of total portfolio market value (which legitimately differs from the
        // investable PrincipalAmount total). Subsection hides when there are no holdings.
        Map<String, Decimal> classMV = new Map<String, Decimal>();
        Decimal totalMV = 0;
        if (!investmentFaIds.isEmpty()) {
            for (AggregateResult ar : [
                SELECT AssetClass ac, SUM(MarketValue) mv
                FROM SecuritiesHolding
                WHERE FinancialAccountId IN :investmentFaIds
                GROUP BY AssetClass
            ]) {
                Decimal mv = (Decimal) ar.get('mv');
                if (mv == null || mv == 0) continue;
                String label = assetClassLabel((String) ar.get('ac'));
                Decimal prior = classMV.containsKey(label) ? classMV.get(label) : 0;
                classMV.put(label, prior + mv);
                totalMV += mv;
            }
        }
        if (totalMV > 0) {
            List<AllocationRow> rows = new List<AllocationRow>();
            for (String label : classMV.keySet()) {
                Decimal mv = classMV.get(label);
                AllocationRow arow = new AllocationRow();
                arow.asset        = label;
                arow.actual       = mv;
                arow.pct          = (mv / totalMV * 100).setScale(0);
                arow.captionLabel = label + ': ' + usd(mv) + ' (' + String.valueOf(arow.pct.setScale(0)) + '%)';
                rows.add(arow);
            }
            rows.sort(new AllocationComparator());
            p.allocation = rows;
        }
        p.showAllocation = !p.allocation.isEmpty();

        // ---- Financial goals: the 4 BEST-FUNDED goals (rings read as progress, not near-empty) ----
        // SOQL can't ORDER BY a computed ratio, so pull the client's goals and rank in Apex (small set).
        List<FinancialGoal> allGoals = [
            SELECT Id, Name, TargetAmount, ActualAmount
            FROM FinancialGoal
            WHERE FinancialPlan.AccountId = :recordId
        ];
        allGoals.sort(new GoalFundingComparator());
        Integer goalCount = 0;
        for (FinancialGoal g : allGoals) {
            if (goalCount == 4) break;
            goalCount++;
            Goal goal = new Goal();
            goal.name = cleanGoalName(g.Name);
            Decimal actual = g.ActualAmount == null ? 0 : g.ActualAmount;
            Decimal target = g.TargetAmount == null ? 0 : g.TargetAmount;
            goal.pct = target > 0 ? (actual / target * 100).setScale(0) : 0;
            // Ring color: only 'success' renders natively across Slackbot + AEA; 'primary' shows as a
            // heavy black/blue ring. So funded/on-track goals use success (green), behind goals warning.
            goal.color = goal.pct >= 33 ? 'success' : 'warning';
            goal.url   = base + '/lightning/r/FinancialGoal/' + g.Id + '/view';
            goal.captionLabel = goal.name + ': ' + usd(actual) + ' (' + String.valueOf(goal.pct.setScale(0)) + '%)';
            p.goals.add(goal);
        }

        // ---- Action items: OPEN tasks + upcoming events across the household (account + its opps) ----
        // "Open" excludes completed at the SOQL level, not by post-filtering: Task IsClosed = false,
        // Event ActivityDate >= today (Event has no IsClosed). Sorted soonest-deadline first.
        if (!activityWhatIds.isEmpty()) {
            for (Task t : [
                SELECT Id, Subject, ActivityDate, Status, IsClosed FROM Task
                WHERE WhatId IN :activityWhatIds AND IsClosed = false
                ORDER BY ActivityDate ASC NULLS LAST LIMIT 15
            ]) {
                ActionItemRow a = new ActionItemRow();
                a.subject = clamp(t.Subject, LINK_LABEL_MAX);
                a.type    = 'Task';
                a.dueDate = t.ActivityDate != null ? t.ActivityDate.format() : '';
                a.sortKey = iso(t.ActivityDate);
                Boolean pastDue = t.ActivityDate != null && t.ActivityDate < Date.today();
                a.status  = pastDue ? 'Past due' : t.Status;
                a.url     = base + '/lightning/r/Task/' + t.Id + '/view';
                applyActivityStyle(a, pastDue);
                p.actionItems.add(a);
            }
            for (Event ev : [
                SELECT Id, Subject, ActivityDate FROM Event
                WHERE WhatId IN :activityWhatIds AND ActivityDate >= :Date.today()
                ORDER BY ActivityDate ASC NULLS LAST LIMIT 15
            ]) {
                ActionItemRow a = new ActionItemRow();
                a.subject = clamp(ev.Subject, LINK_LABEL_MAX);
                a.type    = 'Event';
                a.dueDate = ev.ActivityDate != null ? ev.ActivityDate.format() : '';
                a.sortKey = iso(ev.ActivityDate);
                a.status  = 'Upcoming';
                a.url     = base + '/lightning/r/Event/' + ev.Id + '/view';
                applyActivityStyle(a, false);
                p.actionItems.add(a);
            }
            p.actionItems.sort(new ActionItemComparator());
            // keep the card compact: soonest 8 open items
            if (p.actionItems.size() > 8) {
                List<ActionItemRow> trimmed = new List<ActionItemRow>();
                for (Integer i = 0; i < 8; i++) trimmed.add(p.actionItems[i]);
                p.actionItems = trimmed;
            }
        }

        // ---- Service cases across the household (6, most recent first) ----
        // While iterating, capture two signals for the sections below: the newest OPEN high-priority
        // case (a follow-up priority) and the newest CLOSED case (a material recent change).
        Case topOpenHiCase = null;
        Case newestClosedCase = null;
        for (Case c : [
            SELECT Id, Subject, Status, Priority, IsClosed
            FROM Case WHERE AccountId IN :memberAccountIds
            ORDER BY CreatedDate DESC LIMIT 6
        ]) {
            CaseRow cr = new CaseRow();
            cr.subject  = clamp(c.Subject, LINK_LABEL_MAX);
            cr.status   = c.Status;
            cr.priority = c.Priority;
            cr.url      = base + '/lightning/r/Case/' + c.Id + '/view';
            p.cases.add(cr);

            if (!c.IsClosed && c.Priority == 'High' && topOpenHiCase == null) {
                topOpenHiCase = c;
            }
            if (c.IsClosed && newestClosedCase == null) {
                newestClosedCase = c;
            }
        }

        // ---- Recent Changes: <=3 material developments derived from record STATE ----
        // No "last review" anchor exists in the demo data, so these are the freshest state signals:
        // the largest won deal, the most recently resolved case, and the newest upcoming meeting.
        if (topWonName != null) {
            p.recentChanges.add(makeChange(
                'Closed-won: ' + topWonName,
                (topWonAmt != null ? usd(topWonAmt) + ' booked to the relationship' : 'Deal booked to the relationship')
            ));
        }
        if (newestClosedCase != null) {
            p.recentChanges.add(makeChange(
                'Case resolved: ' + newestClosedCase.Subject,
                'Status ' + newestClosedCase.Status + ' -- confirm client is satisfied'
            ));
        }
        for (ActionItemRow a : p.actionItems) {
            if (a.type == 'Event') {
                p.recentChanges.add(makeChange('Upcoming: ' + a.subject, a.dueDate + ' -- prep ahead of the meeting'));
                break;
            }
        }
        if (p.recentChanges.size() > 3) {
            List<RecentChangeRow> t = new List<RecentChangeRow>();
            for (Integer i = 0; i < 3; i++) t.add(p.recentChanges[i]);
            p.recentChanges = t;
        }
        p.showRecentChanges = !p.recentChanges.isEmpty();

        // ---- Advisor Priorities: <=3 actionable items, sharpest first ----
        // 1) review the single largest open deal, 2) fund the most-behind goal, 3) follow up the
        // highest-priority open case. Each is gated on the underlying record actually existing.
        // Titles are short, uniform verb phrases; the specific deal / goal / case name lives in detail.
        if (p.largestOpenDealName != null) {
            p.attentionItems.add(makeAttention(
                'Advance largest open deal',
                p.largestOpenDealName + (largestOpenAmt != null ? ' (' + usd(largestOpenAmt) + ') -- advance before the next check-in' : ' -- advance before the next check-in'),
                'Open deal', 'warning'
            ));
        }
        Goal behindGoal = mostBehindGoal(p.goals);
        if (behindGoal != null && behindGoal.pct != null && behindGoal.pct < 50) {
            p.attentionItems.add(makeAttention(
                'Fund most-behind goal',
                behindGoal.name + ' tracking at ' + String.valueOf(behindGoal.pct.setScale(0)) + '% -- schedule a funding conversation',
                behindGoal.pct.setScale(0) + '% funded', 'error'
            ));
        }
        if (topOpenHiCase != null) {
            p.attentionItems.add(makeAttention(
                'Resolve service issue',
                topOpenHiCase.Subject + ' -- high-priority case still ' + topOpenHiCase.Status,
                'High priority', 'error'
            ));
        }
        if (p.attentionItems.size() > 3) {
            List<AttentionItemRow> t = new List<AttentionItemRow>();
            for (Integer i = 0; i < 3; i++) t.add(p.attentionItems[i]);
            p.attentionItems = t;
        }
        p.showAttentionItems = !p.attentionItems.isEmpty();

        // ---- Advisor snapshot (data-driven narrative from the numbers above) ----
        p.advisorSnapshot = buildSnapshot(p, investable, mortgageOut);

        // ---- Deep-link CTA to the household group ----
        p.householdUrl = householdId != null
            ? base + '/lightning/r/Account/' + householdId + '/view'
            : p.recordUrl;

        return p;
    }

    // Ranks allocation rows by dollars DESC so the largest class renders first.
    global class AllocationComparator implements Comparator<AllocationRow> {
        public Integer compare(AllocationRow a, AllocationRow b) {
            Decimal da = a.actual == null ? 0 : a.actual;
            Decimal db = b.actual == null ? 0 : b.actual;
            if (da == db) return 0;
            return da > db ? -1 : 1;
        }
    }

    // ---- helpers ----

    // True whenever a FinancialAccount name carries the first name of a SAME-SURNAME person who is
    // NOT in this household -- the signal that the account belongs to a different family. Matched on
    // word boundaries so "Aarav" hits only the standalone token, never a substring of another word.
    private static Boolean containsOutsider(String faName, Set<String> outsiderFirstNames) {
        if (String.isBlank(faName) || outsiderFirstNames == null || outsiderFirstNames.isEmpty()) return false;
        String n = faName.toLowerCase();
        for (String fn : outsiderFirstNames) {
            if (String.isBlank(fn)) continue;
            if (Pattern.matches('.*\\b' + Pattern.quote(fn) + '\\b.*', n)) return true;
        }
        return false;
    }

    // Normalize the SecuritiesHolding.AssetClass picklist to the display taxonomy the card uses.
    // Nulls / unrecognized values roll up to "Other" so no market value is silently dropped.
    private static String assetClassLabel(String raw) {
        String v = String.isBlank(raw) ? '' : raw.trim().toLowerCase();
        if (v == 'equities' || v == 'equity') return 'Equities';
        if (v == 'fixed income' || v == 'fixedincome' || v == 'bonds') return 'Fixed Income';
        if (v.startsWith('cash')) return 'Cash';
        if (v.startsWith('alternative')) return 'Alternatives';
        return 'Other';
    }

    private static RecentChangeRow makeChange(String title, String detail) {
        RecentChangeRow r = new RecentChangeRow();
        r.title     = title;
        r.detail    = detail;
        r.dateLabel = 'Recent';
        return r;
    }

    private static AttentionItemRow makeAttention(String title, String detail, String statusLabel, String statusVariant) {
        AttentionItemRow a = new AttentionItemRow();
        a.title         = title;
        a.detail        = detail;
        a.statusLabel   = statusLabel;
        a.statusVariant = statusVariant;
        return a;
    }

    // Lowest-funded goal by percent (nulls treated as 0). Returns null on an empty list.
    private static Goal mostBehindGoal(List<Goal> goals) {
        if (goals == null || goals.isEmpty()) return null;
        Goal behind = null;
        for (Goal g : goals) {
            Decimal pct = g.pct == null ? 0 : g.pct;
            if (behind == null || pct < (behind.pct == null ? 0 : behind.pct)) behind = g;
        }
        return behind;
    }

    private static String initials(String first, String last, String fullName) {
        String f = String.isNotBlank(first) ? first.substring(0, 1) : '';
        String l = String.isNotBlank(last) ? last.substring(0, 1) : '';
        String res = (f + l).toUpperCase();
        if (String.isBlank(res) && String.isNotBlank(fullName)) {
            res = fullName.substring(0, 1).toUpperCase();
        }
        return res;
    }

    // Up-to-2-char avatar initials from a person name: first letter of the first and last word.
    private static String toInitials(String name) {
        if (String.isBlank(name)) return '?';
        List<String> parts = name.trim().split('\\s+');
        String first = parts[0].substring(0, 1);
        String last = parts.size() > 1 ? parts[parts.size() - 1].substring(0, 1) : '';
        return (first + last).toUpperCase();
    }

    // Map an action item's status to the tile/icon color + tile/badge variant enums so the row
    // renders with a semantic status dot & badge instead of plain text. Overdue = error, done =
    // success (not expected here since we query open-only), upcoming/in-progress = warning, else neutral.
    private static void applyActivityStyle(ActionItemRow a, Boolean pastDue) {
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

    // ISO yyyy-MM-dd (sorts lexically = chronologically). Null-safe.
    private static String iso(Date d) {
        if (d == null) return null;
        return DateTime.newInstance(d.year(), d.month(), d.day()).formatGmt('yyyy-MM-dd');
    }

    // Clamp a display label to a max length so a single long name can't force an HXL table's link
    // column wider than the LEX panel (link cells don't wrap). URL/href is unaffected -- only the label.
    private static String clamp(String s, Integer max) {
        if (String.isBlank(s) || s.length() <= max) return s;
        return s.substring(0, max - 1).trim() + '…';
    }

    private static String usd(Decimal amount) {
        if (amount == null) amount = 0;
        // integer-dollar formatting with thousands separators, e.g. $2,150,000
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

    /**
     * Builds a TIGHT advisor briefing: two-to-three focused sentences. The stat boxes, Priority
     * Goals, Financial Position, and Advisor Priorities sections now carry the detail this narrative
     * used to duplicate, so the briefing stays high-level -- who they are + net position, then the
     * single sharpest next action. All figures trace to real records, so it changes per client.
     */
    private static String buildSnapshot(ClientProfile p, Decimal investable, Decimal mortgageOut) {
        List<String> lines = new List<String>();

        // Sentence 1: who they are + net position (investable minus mortgage).
        Decimal net = (investable == null ? 0 : investable) - (mortgageOut == null ? 0 : mortgageOut);
        String opener = '**' + p.clientName + '** is a **' + p.segment + '** client'
            + (String.isNotBlank(p.advisorName) ? ' managed by ' + p.advisorName : '') + '. ';
        opener += 'Investable assets of **' + usd(investable) + '**';
        if (mortgageOut != null && mortgageOut > 0) {
            opener += ' against **' + usd(mortgageOut) + '** in mortgage debt put net worth near **' + usd(net) + '**';
        }
        opener += '.';
        lines.add(opener);

        // Sentence 2: the single sharpest next action -- the top priority's detail already names the
        // specific record & action, so lead with it directly (the title is a duplicate verb phrase).
        if (p.attentionItems != null && !p.attentionItems.isEmpty()) {
            String detail = p.attentionItems[0].detail;
            lines.add('Next best action: ' + detail + (detail.endsWith('.') ? '' : '.'));
        } else if (p.openOppCount != null && p.openOppCount > 0) {
            lines.add('**' + p.openOppCount + '** open '
                + (p.openOppCount == 1 ? 'deal' : 'deals') + ' worth **' + p.relationshipPipeline
                + '** across the household warrant a review before the next check-in.');
        } else {
            lines.add('Review the household before the next check-in.');
        }

        return String.join(lines, ' ');
    }

    private static String cleanGoalName(String name) {
        if (String.isBlank(name)) return name;
        // strip the "JR-" style prefix used by the seeder
        if (name.length() > 3 && name.substring(2, 3) == '-') {
            return name.substring(3);
        }
        return name;
    }
}
