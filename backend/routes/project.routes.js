const express = require("express");
const {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
} = require("../controllers/project.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.route("/").post(createProject).get(getProjects);
router.route("/:id").get(getProjectById).delete(deleteProject);

module.exports = router;
