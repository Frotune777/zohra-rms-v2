# Tax-account expectation correction

This completed 421-case run passed 420 and failed the older POS-006 journal-account expectation. Its persisted evidence shows payment 262.50, revenue 250.00 and tax 12.50 in account 2100. The assertion expected supplier payables 2000; current POS resolves the configured tax account and defaults to 2100. Only that expected account was corrected. The focused follow-up passes 1/1; the later final full run remains separate.

The coverage summary was generated after adding the previously unmapped PO-003 scenario to the checklist; it has 174 IDs and retains partial scope. The earlier copied 362-case coverage was replaced because it did not belong to this run.
