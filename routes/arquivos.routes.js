import { Router } from "express";
import { excluirArquivo, listarArquivos, renderArquivos } from "../controllers/arquivos.controller.js";

const router = Router();

router.get("/", renderArquivos);
router.get("/listar", listarArquivos);
router.delete("/:nome", excluirArquivo);

export default router;
