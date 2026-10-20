const express = require("express");
const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
} = require("../controllers/task.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.route("/").post(createTask).get(getTasks);
router.route("/:id").get(getTaskById).put(updateTask).delete(deleteTask);

module.exports = router;
