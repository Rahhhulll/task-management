const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Task = require("../models/task.model");
const Project = require("../models/project.model");
const User = require("../models/user.model");
const taskController = require("../controllers/task.controller");
const projectController = require("../controllers/project.controller");
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth.middleware");

const ownerId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();
const validId = "507f1f77bcf86cd799439011";

const stub = (t, object, key, replacement) => {
  const original = object[key];
  object[key] = replacement;
  t.after(() => {
    object[key] = original;
  });
};

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("task and project validators reject missing values, invalid IDs, and ownership fields", () => {
  assert.throws(
    () => taskController.validateTaskFields({ title: "  " }, { requireTitle: true }),
    /Title must be a non-empty string/
  );
  assert.throws(
    () => taskController.validateTaskFields({ title: "Valid", owner: validId }),
    /Unknown task field: owner/
  );
  assert.throws(
    () =>
      taskController.validateTaskFields(
        { title: "Valid", projectId: "not-an-object-id" },
        { requireTitle: true }
      ),
    /Project ID must be a valid MongoDB ObjectId/
  );
  assert.throws(
    () => projectController.validateProjectBody({ name: "  " }),
    /Project name is required/
  );
  assert.throws(
    () => projectController.validateProjectBody({ name: "Valid", owner: validId }),
    /Unknown project field: owner/
  );
  assert.throws(() => taskController.validateTaskId("bad-id"), /Invalid task ID/);
});

test("authentication validation rejects missing credentials and mass-assignment fields", () => {
  assert.throws(
    () => authController.validateCredentials({ email: "user@example.com", password: "password123", isAdmin: true }),
    /Unknown user field: isAdmin/
  );
  assert.throws(
    () => authController.validateCredentials({ email: "user@example.com", password: "short" }),
    /Password must be at least 8 characters/
  );
  assert.throws(
    () => authController.validateCredentials({ name: "  ", email: "user@example.com", password: "password123" }, { requireName: true }),
    /Name is required/
  );
});

test("registration hashes passwords and returns a signed token; login verifies credentials", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  let savedUser;
  stub(t, User, "create", async (data) => {
    savedUser = { _id: ownerId, ...data };
    return savedUser;
  });
  const registerResponse = response();
  await authController.register(
    {
      body: {
        name: "Test User",
        email: "TEST@example.com",
        password: "long-enough-password",
      },
    },
    registerResponse
  );

  assert.equal(registerResponse.statusCode, 201);
  assert.equal(savedUser.email, "test@example.com");
  assert.equal(savedUser.password, undefined);
  assert.equal(savedUser.passwordHash.includes("long-enough-password"), false);
  assert.equal(registerResponse.body.data.user.passwordHash, undefined);
  assert.equal(
    jwt.verify(registerResponse.body.data.token, process.env.JWT_SECRET).sub,
    ownerId.toString()
  );

  stub(t, User, "findOne", () => ({
    select: async () => savedUser,
  }));
  const loginResponse = response();
  await authController.login(
    {
      body: {
        email: "test@example.com",
        password: "long-enough-password",
      },
    },
    loginResponse
  );
  assert.equal(loginResponse.statusCode, 200);
  assert.equal(loginResponse.body.data.user.email, "test@example.com");
});

test("task project and assigned-user references must exist", async (t) => {
  stub(t, Project, "exists", async () => null);
  stub(t, User, "exists", async () => null);

  await assert.rejects(
    taskController.validateProjectReference(validId, ownerId),
    { statusCode: 404, message: "Project not found" }
  );
  await assert.rejects(
    taskController.validateAssignedUserReference(validId),
    { statusCode: 400, message: "Assigned user not found" }
  );
});

test("protected middleware rejects missing and invalid bearer tokens", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const noTokenResponse = response();
  await authenticate(
    { get: () => undefined },
    noTokenResponse,
    () => assert.fail("next must not be called")
  );
  assert.equal(noTokenResponse.statusCode, 401);

  const invalidTokenResponse = response();
  await authenticate(
    { get: () => "Bearer invalid-token" },
    invalidTokenResponse,
    () => assert.fail("next must not be called")
  );
  assert.equal(invalidTokenResponse.statusCode, 401);
});

test("valid bearer token resolves to an existing user identity", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  stub(t, User, "exists", async () => ({ _id: ownerId }));

  const token = jwt.sign({ sub: ownerId.toString() }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
  const req = { get: () => `Bearer ${token}` };
  let nextCalled = false;
  await authenticate(req, response(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.id.toString(), ownerId.toString());
});

test("task create assigns ownership from authentication and rejects owner spoofing", async (t) => {
  let createdTask;
  stub(t, Task, "create", async (data) => {
    createdTask = { _id: validId, ...data };
    return createdTask;
  });

  for (const status of ["pending", "in_progress", "completed"]) {
    const res = response();
    await taskController.createTask(
      { body: { title: "Owned task", status }, user: { id: ownerId } },
      res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(createdTask.status, status);
    assert.equal(createdTask.userId, ownerId);
  }

  await assert.rejects(
    taskController.createTask(
      { body: { title: "Spoofed task", userId: otherUserId.toString() }, user: { id: ownerId } },
      response()
    ),
    /Unknown task field: userId/
  );
});

test("task creation and updates accept only API status values", async (t) => {
  let updateCallCount = 0;
  stub(t, Task, "findOneAndUpdate", async (_filter, update) => {
    updateCallCount += 1;
    return { _id: validId, ...update.$set };
  });

  for (const status of ["pending", "in_progress", "completed"]) {
    const res = response();
    await taskController.updateTask(
      {
        params: { id: validId },
        body: { status },
        user: { id: ownerId },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.status, status);
  }

  for (const status of ["in-progress", "unknown"]) {
    await assert.rejects(
      taskController.createTask(
        { body: { title: "Invalid status task", status }, user: { id: ownerId } },
        response()
      ),
      /Status must be one of: pending, in_progress, completed/
    );

    await assert.rejects(
      taskController.updateTask(
        {
          params: { id: validId },
          body: { status },
          user: { id: ownerId },
        },
        response()
      ),
      /Status must be one of: pending, in_progress, completed/
    );
  }

  assert.equal(updateCallCount, 3);
});

test("task read, update, and delete queries are always owner-scoped", async (t) => {
  const filters = [];
  stub(t, Task, "findOne", async (filter) => {
    filters.push(filter);
    return null;
  });
  stub(t, Task, "findOneAndUpdate", async (filter) => {
    filters.push(filter);
    return null;
  });
  stub(t, Task, "findOneAndDelete", async (filter) => {
    filters.push(filter);
    return null;
  });

  const req = {
    params: { id: validId },
    body: { title: "Updated task" },
    user: { id: ownerId },
  };
  await assert.rejects(taskController.getTaskById(req, response()), {
    statusCode: 404,
  });
  await assert.rejects(taskController.updateTask(req, response()), {
    statusCode: 404,
  });
  await assert.rejects(taskController.deleteTask(req, response()), {
    statusCode: 404,
  });
  assert.equal(filters.length, 3);
  filters.forEach((filter) => {
    assert.equal(filter.userId, ownerId);
  });
});

test("authorized task CRUD returns success and scopes task listings to the caller", async (t) => {
  const record = { _id: validId, title: "Owned task", userId: ownerId };
  const filters = [];
  stub(t, Task, "findOne", async (filter) => {
    filters.push(filter);
    return record;
  });
  stub(t, Task, "findOneAndUpdate", async (filter) => {
    filters.push(filter);
    return record;
  });
  stub(t, Task, "findOneAndDelete", async (filter) => {
    filters.push(filter);
    return record;
  });
  stub(t, Task, "find", (filter) => {
    filters.push(filter);
    return {
      sort() { return this; },
      skip() { return this; },
      limit: async () => [record],
    };
  });
  stub(t, Task, "countDocuments", async () => 1);

  const req = {
    params: { id: validId },
    body: { title: "Updated task" },
    query: {},
    user: { id: ownerId },
  };
  for (const handler of [
    taskController.getTaskById,
    taskController.updateTask,
    taskController.deleteTask,
    taskController.getTasks,
  ]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
  }
  filters.forEach((filter) => {
    assert.equal(filter.userId, ownerId);
  });
});

test("task status report is scoped to the authenticated owner", async (t) => {
  let pipeline;
  stub(t, Task, "aggregate", async (stages) => {
    pipeline = stages;
    return [];
  });

  const res = response();
  await taskController.getTaskStatusSummary({ user: { id: ownerId } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, {
    pending: 0,
    in_progress: 0,
    completed: 0,
  });
  assert.equal(pipeline[0].$match.userId, ownerId);
});

test("project create, list, detail, and delete operations use authenticated ownership", async (t) => {
  let createdProject;
  let listFilter;
  const detailFilters = [];
  let projectForDetail;
  stub(t, Project, "create", async (data) => {
    createdProject = { _id: validId, ...data };
    return createdProject;
  });
  stub(t, Project, "find", (filter) => {
    listFilter = filter;
    return {
      sort() { return this; },
      skip() { return this; },
      limit: async () => [],
    };
  });
  stub(t, Project, "countDocuments", async () => 0);
  stub(t, Project, "findOne", async (filter) => {
    detailFilters.push(filter);
    return projectForDetail;
  });
  stub(t, Task, "exists", async () => null);

  const req = {
    body: { name: "Owned project" },
    query: {},
    params: { id: validId },
    user: { id: ownerId },
  };
  const createResponse = response();
  await projectController.createProject(req, createResponse);
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createdProject.owner, ownerId);

  await projectController.getProjects(req, response());
  assert.deepEqual(listFilter, { owner: ownerId });

  await assert.rejects(projectController.getProjectById(req, response()), {
    statusCode: 404,
  });
  await assert.rejects(projectController.deleteProject(req, response()), {
    statusCode: 404,
  });

  projectForDetail = {
    _id: validId,
    owner: ownerId,
    deleteOne: async () => undefined,
  };
  const detailResponse = response();
  await projectController.getProjectById(req, detailResponse);
  assert.equal(detailResponse.statusCode, 200);
  const deleteResponse = response();
  await projectController.deleteProject(req, deleteResponse);
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(detailFilters.length, 4);
  detailFilters.forEach((filter) => {
    assert.equal(filter.owner, ownerId);
  });
});

test("newly created project cannot accept client-supplied ownership", async () => {
  assert.throws(
    () =>
      projectController.validateProjectBody({
        name: "Spoofed project",
        owner: otherUserId.toString(),
      }),
    /Unknown project field: owner/
  );
});
