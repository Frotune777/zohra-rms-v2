const express = require("express");
const router = express.Router();
const posController = require("./controller");
const { verifyToken, requirePermission } = require("../../middleware/auth");
const { PERMISSIONS } = require("../../config/permissions");

router.get("/tables", verifyToken, requirePermission(PERMISSIONS.POS_ACCESS), posController.getTables);

router.get(
  "/menu",
  verifyToken,
  requirePermission(PERMISSIONS.POS_ACCESS),
  posController.getMenu,
);
router.post(
  "/menu",
  verifyToken,
  requirePermission(PERMISSIONS.POS_MANAGE_MENU),
  posController.addMenuItem,
);
router.put(
  "/menu/:id",
  verifyToken,
  requirePermission(PERMISSIONS.POS_MANAGE_MENU),
  posController.updateMenuItem,
);
router.delete(
  "/menu/:id",
  verifyToken,
  requirePermission(PERMISSIONS.POS_MANAGE_MENU),
  posController.deleteMenuItem,
);
router.get(
  "/orders",
  verifyToken,
  requirePermission(PERMISSIONS.POS_ACCESS),
  posController.listOrders,
);
router.post(
  "/orders/:id/payments",
  verifyToken,
  requirePermission(PERMISSIONS.POS_ACCESS),
  posController.settleOrder,
);
router.post(
  "/orders/:id/refund",
  verifyToken,
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  require("./refunds").controller,
);
router.post(
  "/orders",
  verifyToken,
  requirePermission(PERMISSIONS.POS_ACCESS),
  posController.createOrder,
);

module.exports = router;
