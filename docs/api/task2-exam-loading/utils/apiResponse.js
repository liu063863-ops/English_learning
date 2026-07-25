export function ok(res, data = null, message = "OK", meta = undefined) {
  return res.json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {})
  });
}

export function fail(res, statusCode, code, message, details = undefined) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}
