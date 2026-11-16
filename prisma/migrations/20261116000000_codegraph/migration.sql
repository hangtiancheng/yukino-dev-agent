-- CodeGraph owns .codegraph/codegraph.db in each checkout. These regex-derived
-- rows have no equivalent node identity and are intentionally discarded.
DROP TABLE IF EXISTS "CodeRelation";
DROP TABLE IF EXISTS "CodeSymbol";
