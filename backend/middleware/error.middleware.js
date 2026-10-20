const notFoundHandler = (req, res, next) => {
  const error = new Error("Route not found");
  error.statusCode = 404;
  next(error);
};

const errorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || error.status || 500;
  let message = error.message;

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((validationError) => validationError.message)
      .join(", ");
  } else if (error.code === 11000) {
    statusCode = 409;
    message = "An account with this email address already exists";
  } else if (error.name === "CastError") {
    statusCode = 400;
    message = "Invalid request data";
  } else if (error.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Request body contains invalid JSON";
  }

  if (statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  if (statusCode >= 500) {
    message = "Internal server error";
    console.error("Unexpected server error");
  }

  res.status(statusCode).json({
    success: false,
    message: message || "Internal server error",
  });
};

module.exports = { notFoundHandler, errorHandler };
