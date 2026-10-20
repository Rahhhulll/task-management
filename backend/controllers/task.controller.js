const mongoose = require("mongoose");
const Task = require("../models/task.model");
const Project = require("../models/project.model");
const User = require("../models/user.model");

const TASK_STATUSES = ["pending", "in_progress", "completed"];
const TASK_PRIORITIES = ["low", "medium", "high"];
const TASK_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "projectId",
  "assignedUserId",
];
const REPORT_STATUSES = ["pending", "in_progress", "completed"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const createRequestError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateTaskFields = (body, { requireTitle = false } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createRequestError("Request body must be a JSON object");
  }

  const unknownFields = Object.keys(body).filter(
    (field) => !TASK_FIELDS.includes(field)
  );

  if (unknownFields.length > 0) {
    throw createRequestError(`Unknown task field: ${unknownFields[0]}`);
  }

  if (requireTitle && !Object.prototype.hasOwnProperty.call(body, "title")) {
    throw createRequestError("Title is required");
  }

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      throw createRequestError("Title must be a non-empty string");
    }

    if (body.title.trim().length > 200) {
      throw createRequestError("Title cannot exceed 200 characters");
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "description") &&
    (typeof body.description !== "string" || body.description.length > 5000)
  ) {
    throw createRequestError(
      "Description must be a string no longer than 5000 characters"
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "status") &&
    !TASK_STATUSES.includes(body.status)
  ) {
    throw createRequestError(
      `Status must be one of: ${TASK_STATUSES.join(", ")}`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "priority") &&
    !TASK_PRIORITIES.includes(body.priority)
  ) {
    throw createRequestError(
      `Priority must be one of: ${TASK_PRIORITIES.join(", ")}`
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
    if (
      body.dueDate !== null &&
      (typeof body.dueDate !== "string" || !isValidTaskDate(body.dueDate))
    ) {
      throw createRequestError("Due date must be a valid ISO date string or null");
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "projectId") &&
    body.projectId !== null &&
    (typeof body.projectId !== "string" ||
      !mongoose.isObjectIdOrHexString(body.projectId))
  ) {
    throw createRequestError("Project ID must be a valid MongoDB ObjectId or null");
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "assignedUserId") &&
    body.assignedUserId !== null &&
    (typeof body.assignedUserId !== "string" ||
      !mongoose.isObjectIdOrHexString(body.assignedUserId))
  ) {
    throw createRequestError(
      "Assigned user ID must be a valid MongoDB ObjectId or null"
    );
  }

  if (!requireTitle && Object.keys(body).length === 0) {
    throw createRequestError("At least one task field is required");
  }
};

const parsePositiveInteger = (value, name, defaultValue, maximum) => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultValue;
  }

  const numericValue = Number(rawValue);

  if (
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

const validateTaskId = (id) => {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw createRequestError("Invalid task ID");
  }
};

const isValidTaskDate = (value) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const isoDateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    );

  if (!dateOnly && !isoDateTime) {
    return false;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return calendarDate.toISOString().slice(0, 10) === value.slice(0, 10);
};

const validateDateValue = (value, fieldName = "Due date") => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !isValidTaskDate(value)) {
    throw createRequestError(`${fieldName} must be a valid ISO date string`);
  }

  return new Date(value);
};

const validateListQuery = (query = {}) => {
  const allowedQueryParameters = [
    "status",
    "priority",
    "projectId",
    "dueDate",
    "search",
    "page",
    "limit",
  ];

  const unknownParameters = Object.keys(query).filter(
    (parameter) => !allowedQueryParameters.includes(parameter)
  );

  if (unknownParameters.length > 0) {
    throw createRequestError(`Unknown query parameter: ${unknownParameters[0]}`);
  }

  if (Object.values(query).some(Array.isArray)) {
    throw createRequestError("Query parameters must not be repeated");
  }

  const status = query.status;
  const priority = query.priority;
  const projectId = query.projectId;
  const dueDate = query.dueDate;
  const search = query.search;

  if (status !== undefined && !TASK_STATUSES.includes(status)) {
    throw createRequestError(
      `Status must be one of: ${TASK_STATUSES.join(", ")}`
    );
  }

  if (priority !== undefined && !TASK_PRIORITIES.includes(priority)) {
    throw createRequestError(
      `Priority must be one of: ${TASK_PRIORITIES.join(", ")}`
    );
  }

  if (
    projectId !== undefined &&
    (typeof projectId !== "string" ||
      !mongoose.isObjectIdOrHexString(projectId))
  ) {
    throw createRequestError("Project ID must be a valid MongoDB ObjectId");
  }

  if (dueDate !== undefined) {
    validateDateValue(dueDate, "Due date");
  }

  if (search !== undefined && typeof search !== "string") {
    throw createRequestError("Search must be a string");
  }

  const page = parsePositiveInteger(
    query.page,
    "Page",
    DEFAULT_PAGE,
    Number.MAX_SAFE_INTEGER
  );
  const limit = parsePositiveInteger(
    query.limit,
    "Limit",
    DEFAULT_LIMIT,
    MAX_LIMIT
  );

  return {
    status,
    priority,
    projectId,
    dueDate,
    search: search !== undefined && search.trim() ? search.trim() : undefined,
    page,
    limit,
  };
};

const buildTaskFilter = ({
  status,
  priority,
  projectId,
  dueDate,
  search,
  userId,
} = {}) => {
  const filter = {};

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (projectId) {
    if (!mongoose.isObjectIdOrHexString(projectId)) {
      throw createRequestError("Project ID must be a valid MongoDB ObjectId");
    }
    filter.projectId = new mongoose.Types.ObjectId(projectId);
  }

  if (dueDate) {
    const start = new Date(dueDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    filter.dueDate = {
      $gte: start,
      $lt: end,
    };
  }

  if (search) {
    filter.title = { $regex: escapeRegExp(search), $options: "i" };
  }

  if (userId) filter.userId = userId;

  return filter;
};

const buildStatusSummary = (statusCounts = []) => {
  const summary = {
    pending: 0,
    in_progress: 0,
    completed: 0,
  };

  statusCounts.forEach(({ _id, count }) => {
    if (summary[_id] !== undefined) {
      summary[_id] = count;
    }
  });

  return summary;
};

const createTask = async (req, res) => {
  validateTaskFields(req.body, { requireTitle: true });
  await validateProjectReference(req.body.projectId, req.user.id);
  await validateAssignedUserReference(req.body.assignedUserId);
  const taskData = {};
  TASK_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      taskData[field] = req.body[field];
    }
  });
  taskData.userId = req.user.id;
  const task = await Task.create(taskData);

  res.status(201).json({
    success: true,
    message: "Task created successfully",
    data: task,
  });
};

const getTasks = async (req, res) => {
  const { status, priority, projectId, dueDate, search, page, limit } =
    validateListQuery(req.query);

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    throw createRequestError("Page and limit result in an unsupported offset");
  }

  const filter = buildTaskFilter({
    userId: req.user.id,
    status,
    priority,
    projectId,
    dueDate,
    search,
  });

  const [tasks, total] = await Promise.all([
    Task.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Task.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: "Tasks retrieved successfully",
    data: tasks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

const getTaskById = async (req, res) => {
  validateTaskId(req.params.id);
  const task = await Task.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  res.status(200).json({
    success: true,
    message: "Task retrieved successfully",
    data: task,
  });
};

const updateTask = async (req, res) => {
  validateTaskId(req.params.id);
  validateTaskFields(req.body);
  await validateProjectReference(req.body.projectId, req.user.id);
  await validateAssignedUserReference(req.body.assignedUserId);

  const updates = {};
  TASK_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field];
    }
  });

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  res.status(200).json({
    success: true,
    message: "Task updated successfully",
    data: task,
  });
};

const validateProjectReference = async (projectId, userId) => {
  if (projectId === undefined || projectId === null) {
    return;
  }

  const projectExists = await Project.exists({ _id: projectId, owner: userId });
  if (!projectExists) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }
};

const validateAssignedUserReference = async (assignedUserId) => {
  if (assignedUserId === undefined || assignedUserId === null) {
    return;
  }

  if (!(await User.exists({ _id: assignedUserId }))) {
    throw createRequestError("Assigned user not found");
  }
};

const getTaskStatusSummary = async (req, res) => {
  const statusCounts = await Task.aggregate([
    {
      $match: {
        userId: req.user.id,
        status: { $in: REPORT_STATUSES },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = buildStatusSummary(statusCounts);

  res.status(200).json({
    success: true,
    message: "Task status counts retrieved successfully",
    data: summary,
  });
};

const deleteTask = async (req, res) => {
  validateTaskId(req.params.id);
  const task = await Task.findOneAndDelete({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  res.status(200).json({
    success: true,
    message: "Task deleted successfully",
    data: task,
  });
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStatusSummary,
  buildTaskFilter,
  buildStatusSummary,
  validateListQuery,
  TASK_STATUSES,
  TASK_PRIORITIES,
  validateTaskFields,
  validateProjectReference,
  validateAssignedUserReference,
  validateTaskId,
};
