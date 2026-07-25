import mongoose from "mongoose";
import { fail } from "../utils/apiResponse.js";

export class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(_req, res) {
  return fail(res, 404, "ROUTE_NOT_FOUND", "接口不存在");
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ApiError) {
    return fail(res, error.statusCode, error.code, error.message, error.details);
  }

  if (error instanceof mongoose.Error.CastError) {
    return fail(res, 400, "INVALID_OBJECT_ID", "资源 ID 格式不正确", {
      path: error.path,
      value: error.value
    });
  }

  if (error?.code === 11000) {
    return fail(res, 409, "DUPLICATE_RESOURCE", "资源重复", error.keyValue);
  }

  console.error(error);
  return fail(res, 500, "INTERNAL_SERVER_ERROR", "服务器内部错误");
}
