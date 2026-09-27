const dotenv = require("dotenv");

dotenv.config({
  path: ".env.local",
});

require("./memory-worker");