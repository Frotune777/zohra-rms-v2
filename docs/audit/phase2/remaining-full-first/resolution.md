# First full remaining-feature audit

435/436 passed. BILL-001 expected Pending creation to increase stock to 22; the new contract correctly kept 20 until approval. The expanded regression verifies Pending stock 20, then Approved stock 22/book value 3320. The original failure remains in results.json. The final current-source audit passes this expanded case.
