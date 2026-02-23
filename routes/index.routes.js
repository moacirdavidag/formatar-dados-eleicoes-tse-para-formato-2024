import { Router } from "express";
import { importarCSV } from "../controllers/index.controller.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const basePath = path.join(process.cwd(), "assets", "arquivos_tse");
      fs.mkdirSync(basePath, { recursive: true });
      cb(null, basePath);
    },
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

router.get("/", (req, res) => res.render("home"));
router.get("/health", (req, res) => res.status(200).send('Tudo ok :)'));
router.post(
  "/importar",
  upload.fields([
    { name: "detalheCSV", maxCount: 1 },
    { name: "candidatoCSV", maxCount: 1 },
  ]),
  importarCSV
);

export default router;
