# Task Management API

The API base URL for local development is `http://localhost:5000`. The port is
configured with `PORT`. Angular can call the API from `http://localhost:4200`;
set `FRONTEND_ORIGIN` to a comma-separated list of allowed browser origins when
deploying or using another development URL. Requests from tools without an
`Origin` header, such as Thunder Client, are allowed.

All request and response bodies use JSON. Send `Content-Type: application/json`
for `POST` and `PUT` requests.

## Task fields

| Field | Type | Rules |
| --- | --- | --- |
| `title` | string | Required on create, trimmed, 1–200 characters |
| `description` | string | Optional, up to 5000 characters |
| `status` | string | `pending`, `in_progress`, or `completed`; defaults to `pending` |
| `priority` | string | `low`, `medium`, or `high`; defaults to `medium` |
| `dueDate` | date string or `null` | Optional; send an ISO date such as `2026-10-25` |
| `projectId` | ObjectId string or `null` | Optional project reference; the referenced project must exist |
| `assignedUserId` | ObjectId string or `null` | Optional assigned user; the user must exist |
| `userId` | ObjectId string | Set from the verified token; never accepted in request bodies |
| `createdAt` | date string | Set by Mongoose |
| `updatedAt` | date string | Set by Mongoose |

MongoDB document IDs are returned as `_id`.

## Projects

Project endpoints accept JSON request and response bodies. A project has:

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | Required, trimmed, 1–120 characters |
| `description` | string | Optional, up to 2000 characters |
| `owner` | ObjectId | Set from the verified token; never accepted in request bodies |
| `createdAt`, `updatedAt` | date strings | Managed by Mongoose |

| Method | URL | Request | Success |
| --- | --- | --- | --- |
| `POST` | `/api/projects` | Bearer token; `{ "name": "...", "description": "..." }` | `201`, `{ success, message, data }` |
| `GET` | `/api/projects?page=1&limit=10` | Bearer token; optional `page`, `limit` | `200`, `{ success, message, data, pagination }` |
| `GET` | `/api/projects/:id` | Bearer token; MongoDB ObjectId in `id` | `200`, `{ success, message, data }` |
| `DELETE` | `/api/projects/:id` | Bearer token; MongoDB ObjectId in `id` | `200`, `{ success, message, data }` |

Project listing defaults to page `1` and limit `10`; limit is capped at `100`.
Deleting a project with associated tasks is restricted and returns `409`.
Tasks can reference projects using the optional `projectId` field. A task
cannot be assigned to a project that does not exist.

## Authentication

Project, task, and report endpoints require a JSON Web Token. Register or log
in, then send the returned token on every protected request:

`Authorization: Bearer <token>`

| Method | URL | Request | Success |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | `{ "name": "A User", "email": "user@example.com", "password": "at-least-8-characters" }` | `201`, user and token |
| `POST` | `/api/auth/login` | `{ "email": "user@example.com", "password": "at-least-8-characters" }` | `200`, user and token |

Passwords must contain at least 8 characters and no more than 72 UTF-8 bytes;
they are hashed with bcryptjs and are never returned. Tokens use HS256
and expire after one hour. Set `JWT_SECRET` in the ignored local `backend/.env`
to a random value of at least 32 characters. For example, generate a value
locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
and add `JWT_SECRET=<generated-value>` to `.env`. Never commit or share that
value. Registration rejects unknown properties such as `isAdmin`; duplicate
emails return `409`.

The Angular app opens at `/login` when no token is stored. Sign in or create an
account there; the returned token is stored in browser local storage and sent
automatically on protected API requests. A `401` from a protected endpoint
clears the token and returns the user to sign in.

The authenticated user becomes the owner of newly created projects and tasks.
Project and task lists, details, updates, and deletions are scoped to that user;
other users' records appear as `404`. Reports count only the authenticated
user's tasks. A task may optionally include `assignedUserId`; it must refer to
an existing user, but assignment does not transfer ownership or grant access.
Client-provided `owner` and `userId` properties are rejected.

Existing documents created before ownership was added have no owner and are
intentionally inaccessible through authenticated CRUD. Back up and migrate
legacy data by assigning each record to its verified user before relying on
those records.

## Endpoints

| Method | URL | Request | Success |
| --- | --- | --- | --- |
| `POST` | `/api/tasks` | Bearer token; JSON task; `title` required | `201`, `{ success, message, data }` |
| `GET` | `/api/tasks` | Bearer token; optional query parameters below | `200`, `{ success, message, data, pagination }` |
| `GET` | `/api/tasks/:id` | Bearer token; MongoDB ObjectId in `id` | `200`, `{ success, message, data }` |
| `PUT` | `/api/tasks/:id` | Bearer token; JSON with one or more task fields | `200`, `{ success, message, data }` |
| `DELETE` | `/api/tasks/:id` | Bearer token; MongoDB ObjectId in `id` | `200`, `{ success, message, data }` |

The list endpoint accepts:

- `status`: exact status enum value. Valid values are `pending`, `in_progress`, or `completed`.
- `priority`: exact priority enum value. Valid values are `low`, `medium`, or `high`.
- `projectId`: valid MongoDB ObjectId for tasks associated with a project.
- `dueDate`: ISO date string in `YYYY-MM-DD` format. The API matches tasks due on that date.
- `search`: case-insensitive literal substring match against `title`.
- `page`: positive integer, defaults to `1`.
- `limit`: positive integer, defaults to `10`, maximum `100`.

Combine filters together when needed, for example:
`/api/tasks?status=in_progress&priority=high&projectId=507f1f77bcf86cd799439011&dueDate=2026-10-25&search=assignment&page=1&limit=10`

List results are sorted by `createdAt` descending. The `pagination` object has
`page`, `limit`, `total`, and `totalPages`.

The reporting endpoint is:

`GET /api/reports/tasks` (Bearer token required)

Returns counts grouped by status using all three keys, even if one or more counts are zero:

```json
{
  "success": true,
  "message": "Task status counts retrieved successfully",
  "data": {
    "pending": 5,
    "in_progress": 3,
    "completed": 10
  }
}
```

Report counts are scoped to the authenticated user.

Errors use `{ "success": false, "message": "..." }`. Invalid input or IDs return
`400`, missing or inaccessible resources return `404`, missing/invalid
authentication returns `401`, and unexpected server errors return `500` without
stack traces or database details.
