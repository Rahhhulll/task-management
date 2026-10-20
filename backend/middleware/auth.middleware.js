const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/user.model");

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    const error = new Error("JWT_SECRET must be configured with at least 32 characters");
    error.statusCode = 500;
    throw error;
  }

  return secret;
};

const authenticate = async (req, res, next) => {
  const authorization = req.get("authorization");
  const tokenMatch =
    typeof authorization === "string" &&
    authorization.match(/^Bearer ([^\s]+)$/i);

  if (!tokenMatch) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  let payload;
  try {
    payload = jwt.verify(tokenMatch[1], getJwtSecret(), {
      algorithms: ["HS256"],
    });
  } catch (error) {
    if (error.statusCode === 500) {
      return next(error);
    }

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !mongoose.isObjectIdOrHexString(payload.sub)
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }

  try {
    const userExists = await User.exists({ _id: payload.sub });
    if (!userExists) {
      return res.status(401).json({
        success: false,
        message: "Authentication user no longer exists",
      });
    }

    req.user = { id: new mongoose.Types.ObjectId(payload.sub) };
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { authenticate, getJwtSecret };
