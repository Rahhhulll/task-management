const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const { getJwtSecret } = require("../middleware/auth.middleware");

const AUTH_FIELDS = ["name", "email", "password"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createRequestError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateCredentials = (body, { requireName = false } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createRequestError("Request body must be a JSON object");
  }

  const allowedFields = requireName ? AUTH_FIELDS : ["email", "password"];
  const unknownField = Object.keys(body).find((field) => !allowedFields.includes(field));
  if (unknownField) {
    throw createRequestError(`Unknown user field: ${unknownField}`);
  }

  if (requireName && (typeof body.name !== "string" || !body.name.trim())) {
    throw createRequestError("Name is required and must not be empty");
  }

  if (typeof body.email !== "string" || !EMAIL_PATTERN.test(body.email.trim())) {
    throw createRequestError("A valid email address is required");
  }

  if (
    typeof body.password !== "string" ||
    body.password.length < 8 ||
    Buffer.byteLength(body.password, "utf8") > 72
  ) {
    throw createRequestError(
      "Password must be at least 8 characters and no more than 72 UTF-8 bytes"
    );
  }
};

const issueToken = (userId, secret) =>
  jwt.sign({ sub: userId.toString() }, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
  });

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
});

const register = async (req, res) => {
  validateCredentials(req.body, { requireName: true });
  const jwtSecret = getJwtSecret();

  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const user = await User.create({
    name: req.body.name.trim(),
    email: req.body.email.trim().toLowerCase(),
    passwordHash,
  });

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: {
      user: publicUser(user),
      token: issueToken(user._id, jwtSecret),
    },
  });
};

const login = async (req, res) => {
  validateCredentials(req.body);
  const jwtSecret = getJwtSecret();

  const user = await User.findOne({
    email: req.body.email.trim().toLowerCase(),
  }).select("+passwordHash");

  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw createRequestError("Invalid email or password", 401);
  }

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      user: publicUser(user),
      token: issueToken(user._id, jwtSecret),
    },
  });
};

module.exports = { register, login, validateCredentials };
