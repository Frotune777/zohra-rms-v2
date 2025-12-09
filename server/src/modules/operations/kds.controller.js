const db = require('../../config/db');
const { getIo } = require('../../socket');

exports.getTickets = async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM kds_tickets WHERE status != 'Done' ORDER BY created_at ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createTicket = async (req, res) => {
    const { orderId, items, station } = req.body;
    try {
        const result = await db.query(
            "INSERT INTO kds_tickets (order_id, items, station, status) VALUES ($1, $2, $3, 'Pending') RETURNING *",
            [orderId, JSON.stringify(items), station || 'Kitchen']
        );
        const ticket = result.rows[0];

        // Emit socket event
        try {
            getIo().to('kitchen').emit('new_ticket', ticket);
        } catch (e) {
            console.error('Socket emit failed:', e.message);
        }

        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateTicketStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Pending -> Preparing -> Done

    try {
        let query = "UPDATE kds_tickets SET status = $1";
        const params = [status];
        let pIdx = 2;

        if (status === 'Preparing') {
            query += `, started_at = NOW()`;
        } else if (status === 'Done') {
            query += `, completed_at = NOW()`;
        }

        query += ` WHERE id = $${pIdx} RETURNING *`;
        params.push(id);

        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const ticket = result.rows[0];

        // Emit update
        try {
            getIo().to('kitchen').emit('ticket_updated', ticket);
        } catch (e) {
            console.error('Socket emit failed:', e.message);
        }

        res.json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
