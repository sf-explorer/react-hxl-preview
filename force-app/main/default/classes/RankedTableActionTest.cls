/**
 * RankedTableActionTest
 * Covers the RankedTableAction interface: the typed input path (typed columns + a records JSON
 * string of value-rows), the two other accepted record shapes ({id,values} and legacy key→value
 * objects), the legacy `spec` JSON fallback, and the neutral empty/placeholder + error paths.
 * The action is a pure normalizer (no DML/SOQL), so these are fast, data-free unit tests.
 */
@isTest
private class RankedTableActionTest {

    // Convenience: run the action for one Request and return the single RankedTable payload.
    private static RankedTableAction.RankedTable run(RankedTableAction.Request req) {
        List<RankedTableAction.RankedTableResponse> res =
            RankedTableAction.getRankedTable(new List<RankedTableAction.Request>{ req });
        Assert.areEqual(1, res.size(), 'exactly one response expected');
        return res[0].table;
    }

    private static RankedTableAction.ColumnInput col(String header, String align) {
        RankedTableAction.ColumnInput c = new RankedTableAction.ColumnInput();
        c.header = header;
        c.align  = align;
        return c;
    }

    @isTest
    static void typedValueRowsFlattenInColumnOrder() {
        RankedTableAction.Request req = new RankedTableAction.Request();
        req.title       = 'Opportunités';
        req.description = 'Bordeaux · cette semaine';
        req.summary     = 'Concentrez-vous sur Delaunay';
        req.columns     = new List<RankedTableAction.ColumnInput>{ col('Opportunité', null), col('Montant', 'end') };
        req.records     = '[["Delaunay","42 000 €"],["Vidal","31 000 €"]]';

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual('Opportunités', t.title);
        Assert.areEqual('Bordeaux · cette semaine', t.subtitle, 'description maps to subtitle');
        Assert.areEqual('Concentrez-vous sur Delaunay', t.summaryTitle, 'summary maps to the callout title');
        Assert.isTrue(t.showSummary, 'summary present -> callout shown');

        Assert.areEqual(2, t.columns.size());
        Assert.areEqual('start', t.columns[0].align, 'blank align defaults to start');
        Assert.areEqual('end', t.columns[1].align);

        Assert.areEqual(2, t.rows.size());
        RankedTableAction.RowVM r0 = t.rows[0];
        Assert.areEqual('Delaunay', r0.c1);
        Assert.isTrue(r0.c1Show);
        Assert.areEqual('start', r0.c1Align);
        Assert.areEqual('42 000 €', r0.c2);
        Assert.isTrue(r0.c2Show);
        Assert.areEqual('end', r0.c2Align);
        Assert.isFalse(r0.c3Show, 'no third column -> hidden slot');
        // cells[] mirror + emphasis on the first column.
        Assert.areEqual(2, r0.cells.size());
        Assert.areEqual('semibold', r0.cells[0].weight);
        Assert.areEqual('regular', r0.cells[1].weight);
        Assert.areEqual('row0', t.rows[0].id, 'id auto-assigned when absent');
    }

    @isTest
    static void typedRecordsIdAndValuesShape() {
        RankedTableAction.Request req = new RankedTableAction.Request();
        req.columns = new List<RankedTableAction.ColumnInput>{ col('Name', null), col('Amount', 'end') };
        req.records = '[{"id":"vidal","values":["Vidal","31 000 €"]}]';

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual(1, t.rows.size());
        Assert.areEqual('vidal', t.rows[0].id, 'explicit id honored');
        Assert.areEqual('Vidal', t.rows[0].c1);
        Assert.areEqual('31 000 €', t.rows[0].c2);
    }

    @isTest
    static void typedRecordsLegacyKeyedShape() {
        // A row object keyed by the column keys is still accepted.
        RankedTableAction.ColumnInput opp = col('Opp', null);
        opp.key = 'opp';
        RankedTableAction.ColumnInput amt = col('Amount', 'end');
        amt.key = 'amount';

        RankedTableAction.Request req = new RankedTableAction.Request();
        req.columns = new List<RankedTableAction.ColumnInput>{ opp, amt };
        req.records = '[{"opp":"Delaunay","amount":"42 000 €"}]';

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual('Delaunay', t.rows[0].c1, 'value looked up by column key');
        Assert.areEqual('42 000 €', t.rows[0].c2);
    }

    @isTest
    static void columnsCappedAtSix() {
        List<RankedTableAction.ColumnInput> cols = new List<RankedTableAction.ColumnInput>();
        for (Integer i = 0; i < 8; i++) cols.add(col('C' + i, null));
        RankedTableAction.Request req = new RankedTableAction.Request();
        req.columns = cols;
        req.records = '[["a","b","c","d","e","f","g","h"]]';

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual(6, t.columns.size(), 'columns capped at 6');
        Assert.areEqual(6, t.rows[0].cells.size(), 'only 6 cells emitted');
        Assert.isTrue(t.rows[0].c6Show);
    }

    @isTest
    static void badgesAndHighlightsGetEnumDefaults() {
        RankedTableAction.Badge b = new RankedTableAction.Badge();
        b.label = '3 opportunités'; // variant left blank
        RankedTableAction.Highlight h = new RankedTableAction.Highlight();
        h.iconName = 'trending-up';
        h.title    = 'Delaunay'; // iconColor left blank

        RankedTableAction.Request req = new RankedTableAction.Request();
        req.summary    = 'x';
        req.badges     = new List<RankedTableAction.Badge>{ b };
        req.highlights = new List<RankedTableAction.Highlight>{ h };

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual('neutral', t.badges[0].variant, 'blank badge variant defaults to neutral');
        Assert.areEqual('default', t.highlights[0].iconColor, 'blank icon color defaults to default');
        Assert.isTrue(t.showHighlights, 'highlights present -> section shown');
    }

    @isTest
    static void ctaShownWhenLabelPresent() {
        RankedTableAction.Request req = new RankedTableAction.Request();
        req.columns  = new List<RankedTableAction.ColumnInput>{ col('A', null) };
        req.records  = '[["x"]]';
        req.ctaLabel = 'Ouvrir le pipeline';
        req.ctaUrl   = '#';

        RankedTableAction.RankedTable t = run(req);

        Assert.isTrue(t.showCta);
        Assert.areEqual('Ouvrir le pipeline', t.ctaLabel);
    }

    @isTest
    static void malformedRecordsJsonYieldsNoRows() {
        RankedTableAction.Request req = new RankedTableAction.Request();
        req.columns = new List<RankedTableAction.ColumnInput>{ col('A', null) };
        req.records = 'not-json';

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual(1, t.columns.size(), 'columns still render');
        Assert.areEqual(0, t.rows.size(), 'malformed records -> no rows, no throw');
    }

    @isTest
    static void legacySpecJsonStillWorks() {
        RankedTableAction.Request req = new RankedTableAction.Request();
        req.spec = '{"title":"Legacy","summaryTitle":"Takeaway",' +
                   '"columns":[{"key":"opp","header":"Opp","align":"start"},{"key":"amount","header":"Amount","align":"end"}],' +
                   '"rows":[{"id":"r1","opp":"Delaunay","amount":"42 000 €"}]}';

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual('Legacy', t.title);
        Assert.areEqual('Takeaway', t.summaryTitle);
        Assert.isTrue(t.showSummary);
        Assert.areEqual('r1', t.rows[0].id);
        Assert.areEqual('Delaunay', t.rows[0].c1);
        Assert.areEqual('42 000 €', t.rows[0].c2);
    }

    @isTest
    static void malformedSpecJsonRendersErrorCard() {
        RankedTableAction.Request req = new RankedTableAction.Request();
        req.spec = '{ this is not valid json';

        RankedTableAction.RankedTable t = run(req);

        Assert.areEqual('Invalid table spec', t.title);
        Assert.isTrue(t.showSummary);
    }

    @isTest
    static void emptyRequestRendersNeutralPlaceholder() {
        RankedTableAction.RankedTable t = run(new RankedTableAction.Request());

        Assert.areEqual('Tableau priorisé', t.title, 'neutral placeholder title');
        Assert.isTrue(t.showSummary);
        Assert.areEqual(0, t.rows.size());
    }

    @isTest
    static void nullRequestListRendersPlaceholder() {
        List<RankedTableAction.RankedTableResponse> res = RankedTableAction.getRankedTable(null);
        Assert.areEqual(1, res.size());
        Assert.areEqual('Tableau priorisé', res[0].table.title);
    }
}
