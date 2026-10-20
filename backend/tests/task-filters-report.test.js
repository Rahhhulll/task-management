const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTaskFilter, buildStatusSummary, validateListQuery, TASK_STATUSES, TASK_PRIORITIES } = require("../controllers/task.controller");

test("status and priority enum values are standardized to the assignment values", () => {
  assert.deepEqual(TASK_STATUSES, ["pending", "in_progress", "completed"]);
  assert.deepEqual(TASK_PRIORITIES, ["low", "medium", "high"]);
});

test("combined task filters build a valid Mongo query", () => {
  const filter = buildTaskFilter({
    status: "in_progress",
    priority: "high",
    projectId: "507f1f77bcf86cd799439011",
    dueDate: "2026-10-25",
    search: "assignment",
  });

  assert.equal(filter.status, "in_progress");
  assert.equal(filter.priority, "high");
  assert.equal(filter.projectId.toString(), "507f1f77bcf86cd799439011");
  assert.equal(filter.title.$options, "i");
  assert.equal(filter.dueDate.$gte.toISOString().slice(0, 10), "2026-10-25");
  assert.equal(filter.dueDate.$lt.toISOString().slice(0, 10), "2026-10-26");
});

test("list query validation rejects invalid filter values", () => {
  assert.throws(() => validateListQuery({ status: "in-progress" }), /Status must be one of/);
  assert.throws(() => validateListQuery({ priority: "urgent" }), /Priority must be one of/);
  assert.throws(() => validateListQuery({ projectId: "not-an-object-id" }), /Project ID must be a valid MongoDB ObjectId/);
  assert.throws(() => validateListQuery({ dueDate: "not-a-date" }), /Due date must be a valid ISO date string/);
});

test("report summary fills all status keys even when some counts are zero", () => {
  const summary = buildStatusSummary([
    { _id: "pending", count: 5 },
    { _id: "completed", count: 2 },
  ]);

  assert.deepEqual(summary, {
    pending: 5,
    in_progress: 0,
    completed: 2,
  });
});

test("date filter query values are normalized before database queries", () => {
  const query = validateListQuery({
    status: "completed",
    dueDate: "2026-10-25",
    page: "1",
    limit: "10",
  });

  assert.equal(query.status, "completed");
  assert.equal(query.dueDate, "2026-10-25");
  assert.equal(query.page, 1);
  assert.equal(query.limit, 10);
});
