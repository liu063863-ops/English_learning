// Replace this with your real JWT/session authentication middleware.
// Postman can pass x-user-id to simulate a logged-in user.
export function mockAuth(req, _res, next) {
  req.user = {
    id: req.header("x-user-id") || "64f000000000000000000001"
  };
  next();
}
