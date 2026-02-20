import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { engine } from "express-handlebars";

import indexRoutes from "./routes/index.routes.js";
import dadosRoutes from "./routes/dados.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.engine(
  "hbs",
  engine({
    extname: ".hbs",
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "views/layouts"),
    partialsDir: path.join(__dirname, "views/partials"),
    helpers: {
      eq: (a, b) => a == b,
    },
  })
);

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

app.use("/", indexRoutes);
app.use("/dados", dadosRoutes);

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
