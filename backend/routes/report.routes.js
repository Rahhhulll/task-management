const express = require("express");
const { getTaskStatusSummary } = require("../controllers/task.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.get("/tasks", getTaskStatusSummary);

module.exports = router;
