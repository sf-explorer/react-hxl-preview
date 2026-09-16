#!/usr/bin/env python3
"""schema-to-example.py — derive a STRICT JSON Schema from an HXL widget's Lightning type.

An HXL widget's `schema.json` (the `lightning:type` tree under `properties.attributes`)
is the single source of truth for the shape a card renders. But it is LOOSE: every scalar
is `lightning__textType` with the real vocabulary buried in prose (e.g. a description of
`"primary | success | warning | danger | neutral"`), and objects don't forbid stray keys.
The agent (and hand-written demo data) drift from that vocabulary silently — which is how
we ended up with `variant:"info"`, `iconColor:"blue"`, `iconName:"document"` in a live spec.

This tool closes the loop, with NO external dependencies (python 3.9-safe):

  1. --emit-schema   Read a widget schema.json, emit a STRICT JSON Schema for its
                     `attributes`: `additionalProperties:false` on every object, and a closed
                     `enum` on every scalar whose description spells out a pipe/`one of` list.
  2. --example       Generate a valid sample payload from that strict schema (first enum value,
                     title-derived strings) — a starting point for src/demo/data/*.attrs.json.
  3. --validate F    Validate a candidate attrs/spec file against the strict schema: unknown
                     properties and out-of-enum values are ERRORS; values outside a *suggested*
                     (non-closed) set are WARNINGS.
  4. --all-check     Validate every uiWidgets/*/schema.json against its src/demo/data/<name>.attrs.json.
                     Exit non-zero on any error — the CI/linter hook for the CLAUDE.md rule.

Enum sourcing (no machine-readable enums exist in schema.json, so we parse the descriptions):
  * STRICT (closed enum)  — a pipe list "a | b | c", or "one of: a | b | c" / "one of [a, b, c]".
  * SUGGESTED (warn-only) — "Pick from: a, b, c" / "such as ..." / "e.g. ...". Not closed, because
                            the set is illustrative (e.g. the Lucide icon slugs — any valid slug is
                            legal, only a typo'd SLDS name is wrong).

Usage:
  scripts/schema-to-example.py --schema uiWidgets/rankedTableCard/schema.json --emit-schema
  scripts/schema-to-example.py --schema uiWidgets/rankedTableCard/schema.json --example
  scripts/schema-to-example.py --schema uiWidgets/rankedTableCard/schema.json --validate src/demo/data/rankedTableCard.attrs.json
  scripts/schema-to-example.py --all-check
"""

import argparse
import glob
import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDGETS_GLOB = os.path.join(REPO_ROOT, "force-app/main/default/uiWidgets/*/schema.json")
DEMO_DATA_DIR = os.path.join(REPO_ROOT, "src/demo/data")

# lightning:type -> JSON Schema primitive. objectType/listType are handled structurally.
SCALAR_TYPE = {
    "lightning__textType": "string",
    "lightning__richTextType": "string",
    "lightning__urlType": "string",
    "lightning__dateType": "string",
    "lightning__dateTimeType": "string",
    "lightning__booleanType": "boolean",
    "lightning__numberType": "number",
    "lightning__integerType": "integer",
    "lightning__percentType": "number",
    "lightning__currencyType": "number",
}

_TOKEN = r"[a-z][a-z0-9-]*"
# A bare pipe list: "start | end | center", "primary | success | warning | danger | neutral".
_PIPE_LIST = re.compile(r"%s(?:\s*\|\s*%s)+" % (_TOKEN, _TOKEN))
# "one of: a | b | c" / "one of [a, b, c]" — capture up to the first '.' or ']'.
_ONE_OF = re.compile(r"one of\s*:?\s*\[?([^.\]]+)")
# Illustrative sets — warn-only, not closed.
_SUGGESTED = re.compile(r"(?:pick from|such as|e\.g\.)\s*:?\s*\[?([^.\]]+)", re.IGNORECASE)


def _split_tokens(blob):
    """Pull clean lowercase slug tokens out of a captured 'a | b, c' fragment."""
    parts = re.split(r"[|,]", blob)
    out = []
    for p in parts:
        p = p.strip().strip(".").strip()
        if re.fullmatch(_TOKEN, p):
            out.append(p)
    return out


def extract_enum(description):
    """Return (tokens, strict) or (None, False). strict=True means a closed enum."""
    if not description:
        return None, False
    m = _PIPE_LIST.search(description)
    if m:
        toks = _split_tokens(m.group(0))
        if len(toks) >= 2:
            return toks, True
    m = _ONE_OF.search(description)
    if m:
        toks = _split_tokens(m.group(1))
        if len(toks) >= 2:
            return toks, True
    m = _SUGGESTED.search(description)
    if m:
        toks = _split_tokens(m.group(1))
        if len(toks) >= 2:
            return toks, False
    return None, False


def to_strict(node):
    """Convert one lightning:type node into a strict JSON Schema node."""
    lt = node.get("lightning:type")
    title = node.get("title")
    desc = node.get("description")

    if lt == "lightning__objectType":
        props = node.get("properties", {}) or {}
        return {
            "type": "object",
            "additionalProperties": False,
            "properties": {k: to_strict(v) for k, v in props.items()},
        }
    if lt == "lightning__listType":
        items = node.get("items", {}) or {}
        return {"type": "array", "items": to_strict(items)}

    schema = {"type": SCALAR_TYPE.get(lt, "string")}
    if title:
        schema["title"] = title
    tokens, strict = extract_enum(desc)
    if tokens and schema["type"] == "string":
        if strict:
            schema["enum"] = tokens
        else:
            schema["x-suggested"] = tokens
    return schema


def attributes_schema(raw_schema):
    """Extract and convert the `attributes` object from a widget schema.json."""
    attrs = raw_schema.get("properties", {}).get("attributes")
    if attrs is None:
        raise ValueError("schema.json has no properties.attributes")
    return to_strict(attrs)


# ---- example generation ----

def gen_example(schema):
    t = schema.get("type")
    if "enum" in schema:
        return schema["enum"][0]
    if "x-suggested" in schema:
        return schema["x-suggested"][0]
    if t == "object":
        return {k: gen_example(v) for k, v in schema.get("properties", {}).items()}
    if t == "array":
        return [gen_example(schema.get("items", {}))]
    if t == "boolean":
        return True
    if t in ("number", "integer"):
        return 1
    return "Sample %s" % schema.get("title", "text")


# ---- validation ----

def validate(schema, value, path="attributes"):
    """Return a list of (level, path, message). level in {'error','warn'}."""
    issues = []
    if value is None:
        return issues  # optional / explicit null is always allowed

    if "enum" in schema:
        if value not in schema["enum"]:
            issues.append(("error", path, "%r is not one of %s" % (value, schema["enum"])))
        return issues
    if "x-suggested" in schema and isinstance(value, str):
        if value not in schema["x-suggested"]:
            issues.append(("warn", path, "%r is outside the suggested set %s" % (value, schema["x-suggested"])))
        return issues

    t = schema.get("type")
    if t == "object":
        if not isinstance(value, dict):
            issues.append(("error", path, "expected object, got %s" % type(value).__name__))
            return issues
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for k in value:
                if k.startswith("_"):
                    continue  # leading-underscore keys are authoring comments (e.g. _comment), not attributes
                if k not in props:
                    issues.append(("error", "%s.%s" % (path, k), "unexpected property (not in the Lightning type)"))
        for k, sub in props.items():
            if k in value:
                issues += validate(sub, value[k], "%s.%s" % (path, k))
    elif t == "array":
        if not isinstance(value, list):
            issues.append(("error", path, "expected array, got %s" % type(value).__name__))
            return issues
        items = schema.get("items", {})
        for i, item in enumerate(value):
            issues += validate(items, item, "%s[%d]" % (path, i))
    elif t == "string":
        if not isinstance(value, str):
            issues.append(("error", path, "expected string, got %s" % type(value).__name__))
    elif t == "boolean":
        if not isinstance(value, bool):
            issues.append(("error", path, "expected boolean, got %s" % type(value).__name__))
    elif t in ("number", "integer"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            issues.append(("error", path, "expected %s, got %s" % (t, type(value).__name__)))
    return issues


def _candidate_attributes(candidate):
    """A demo attrs file is {_comment?, attributes:{...}}; a bare spec is the attributes object."""
    if isinstance(candidate, dict) and "attributes" in candidate:
        return candidate["attributes"]
    return candidate


def _load(path):
    with open(path) as f:
        return json.load(f)


def _report(issues):
    errors = [i for i in issues if i[0] == "error"]
    warns = [i for i in issues if i[0] == "warn"]
    for level, p, msg in issues:
        mark = "❌" if level == "error" else "⚠️ "
        print("  %s %s: %s" % (mark, p, msg))
    return errors, warns


def cmd_all_check():
    total_err = 0
    for schema_path in sorted(glob.glob(WIDGETS_GLOB)):
        name = os.path.basename(os.path.dirname(schema_path))
        attrs_path = os.path.join(DEMO_DATA_DIR, "%s.attrs.json" % name)
        try:
            strict = attributes_schema(_load(schema_path))
        except Exception as e:  # noqa: BLE001
            print("⚠️  %s: could not parse schema (%s)" % (name, e))
            continue
        if not os.path.exists(attrs_path):
            print("⚠️  %s: no demo data at %s" % (name, os.path.relpath(attrs_path, REPO_ROOT)))
            continue
        issues = validate(strict, _candidate_attributes(_load(attrs_path)))
        errors, warns = [i for i in issues if i[0] == "error"], [i for i in issues if i[0] == "warn"]
        if errors:
            print("❌ %s (%d error, %d warn)" % (name, len(errors), len(warns)))
            _report(issues)
            total_err += len(errors)
        elif warns:
            print("⚠️  %s (%d warn)" % (name, len(warns)))
            _report(warns)
        else:
            print("✅ %s" % name)
    print()
    if total_err:
        print("FAIL — %d error(s) across widgets" % total_err)
        return 1
    print("PASS — all demo data valid against the Lightning types")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", help="path to a widget schema.json")
    ap.add_argument("--emit-schema", action="store_true", help="print the derived strict JSON Schema")
    ap.add_argument("--example", action="store_true", help="print a generated valid sample payload")
    ap.add_argument("--validate", metavar="FILE", help="validate a candidate attrs/spec file")
    ap.add_argument("--all-check", action="store_true", help="validate all widgets' demo data (CI mode)")
    args = ap.parse_args()

    if args.all_check:
        return cmd_all_check()

    if not args.schema:
        ap.error("--schema is required (or use --all-check)")
    strict = attributes_schema(_load(args.schema))

    if args.validate:
        candidate = _candidate_attributes(_load(args.validate))
        issues = validate(strict, candidate)
        if not issues:
            print("✅ valid against %s" % os.path.relpath(args.schema, REPO_ROOT))
            return 0
        errors, _ = _report(issues)
        return 1 if errors else 0

    if args.example:
        print(json.dumps({"attributes": gen_example(strict)}, indent=2, ensure_ascii=False))
        return 0

    # default: emit the strict schema
    print(json.dumps(strict, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
