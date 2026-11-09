const db = require("../../config/db");
const { getIo } = require("../../socket");

exports.getTickets = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT k.*,o.order_number,o.order_type,o.table_number,o.notes FROM kds_tickets k LEFT JOIN orders o ON o.id=k.order_id WHERE k.status NOT IN ('Done','Cancelled') ORDER BY k.created_at ASC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTicket = async (req, res) => {
  const { orderId, items, station } = req.body;
  try {
    const existing = await db.query(
      "SELECT * FROM kds_tickets WHERE order_id=$1",
      [orderId],
    );
    if (existing.rowCount) return res.json(existing.rows[0]);
    const result = await db.query(
      "INSERT INTO kds_tickets (order_id, items, station, status) VALUES ($1, $2, $3, 'Pending') ON CONFLICT(order_id) DO UPDATE SET order_id=EXCLUDED.order_id RETURNING *",
      [orderId, JSON.stringify(items), station || "Kitchen"],
    );
    const ticket = result.rows[0];

    // Emit socket event
    try {
      getIo().to("kitchen").emit("new_ticket", ticket);
    } catch (e) {
      console.error("Socket emit failed:", e.message);
    }

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Pending -> Preparing -> Done

  if (!["Pending", "Preparing", "Done"].includes(status))
    return res.status(400).json({ error: "Invalid kitchen status" });
  try {
    const current = (
      await db.query("SELECT * FROM kds_tickets WHERE id=$1", [id])
    ).rows[0];
    if (!current) return res.status(404).json({ error: "Ticket not found" });
    if (current.status === status) return res.json(current);
    if (!(
      (current.status === "Pending" && status === "Preparing") ||
      (current.status === "Preparing" && status === "Done")
    ))
      return res
        .status(409)
        .json({ error: "Invalid kitchen status transition" });
    const result = await db.query(
      "UPDATE kds_tickets SET status=$1::text,started_at=CASE WHEN $1='Preparing' THEN NOW() ELSE started_at END,completed_at=CASE WHEN $1='Done' THEN NOW() ELSE completed_at END,updated_by=$4 WHERE id=$2 AND status=$3 RETURNING *",
      [status, id, current.status, req.user.id],
    );
    if (!result.rowCount)
      return res
        .status(409)
        .json({ error: "Ticket changed; refresh and retry" });

    const ticket = result.rows[0];

    // Emit update
    try {
      getIo().to("kitchen").emit("ticket_updated", ticket);
    } catch (e) {
      console.error("Socket emit failed:", e.message);
    }

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
