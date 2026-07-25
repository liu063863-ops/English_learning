import { readStore } from "./db.js";

readStore()
  .then(() => {
    console.log("Seed data is ready.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
