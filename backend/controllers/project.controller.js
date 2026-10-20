const mongoose = require("mongoose");
const Project = require("../models/project.model");
const Task = require("../models/task.model");

const PROJECT_FIELDS = ["name", "description"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const createRequestError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateProjectBody = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createRequestError("Request body must be a JSON object");
  }

  const unknownFields = Object.keys(body).filter(
    (field) => !PROJECT_FIELDS.includes(field)
  );

  if (unknownFields.length > 0) {
    throw createRequestError(`Unknown project field: ${unknownFields[0]}`);
  }

  if (
    typeof body.name !== "string" ||
    body.name.trim().length === 0 ||
    body.name.trim().length > 120
  ) {
    throw createRequestError(
      "Project name is required and must not exceed 120 characters"
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "description") &&
    (typeof body.description !== "string" || body.description.length > 2000)
  ) {
    throw createRequestError(
      "Project description must be a string no longer than 2000 characters"
    );
  }
};

const parsePositiveInteger = (value, name, defaultValue, maximum) => {
  if (value === undefined) {
    return defaultValue;
  }

  const numericValue = Number(value);

  if (
    Array.isArray(value) ||
    !Number.isInteger(numericValue) ||
    numericValue <= 0 ||
    numericValue > maximum
  ) {
    throw createRequestError(
      `${name} must be a positive integer no greater than ${maximum}`
    );
  }

  return numericValue;
};

const validateProjectId = (id) => {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw createRequestError("Invalid project ID");
  }
};

const createProject = async (req, res) => {
  validateProjectBody(req.body);

  const project = await Project.create({
    name: req.body.name,
    ...(Object.prototype.hasOwnProperty.call(req.body, "description")
      ? { description: req.body.description }
      : {}),
    owner: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: "Project created successfully",
    data: project,
  });
};

const getProjects = async (req, res) => {
  const allowedQueryParameters = ["page", "limit"];
  const unknownParameters = Object.keys(req.query).filter(
    (parameter) => !allowedQueryParameters.includes(parameter)
  );

  if (unknownParameters.length > 0) {
    throw createRequestError(
      `Unknown query parameter: ${unknownParameters[0]}`
    );
  }

  if (Object.values(req.query).some(Array.isArray)) {
    throw createRequestError("Query parameters must not be repeated");
  }

  const page = parsePositiveInteger(
    req.query.page,
    "Page",
    DEFAULT_PAGE,
    Number.MAX_SAFE_INTEGER
  );
  const limit = parsePositiveInteger(
    req.query.limit,
    "Limit",
    DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    throw createRequestError("Page and limit result in an unsupported offset");
  }

  const [projects, total] = await Promise.all([
    Project.find({ owner: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Project.countDocuments({ owner: req.user.id }),
  ]);

  res.status(200).json({
    success: true,
    message: "Projects retrieved successfully",
    data: projects,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

const getProjectById = async (req, res) => {
  validateProjectId(req.params.id);
  const project = await Project.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });

  if (!project) {
    throw createRequestError("Project not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Project retrieved successfully",
    data: project,
  });
};

const deleteProject = async (req, res) => {
  validateProjectId(req.params.id);

  const project = await Project.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!project) {
    throw createRequestError("Project not found", 404);
  }

  const hasTasks = await Task.exists({
    projectId: project._id,
    userId: req.user.id,
  });
  if (hasTasks) {
    throw createRequestError(
      "Project cannot be deleted while it has associated tasks",
      409
    );
  }

  await project.deleteOne();

  res.status(200).json({
    success: true,
    message: "Project deleted successfully",
    data: project,
  });
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
  validateProjectBody,
};
