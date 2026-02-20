import { Router } from "express";
import { renderDados,buscarDados } from "../controllers/dados.controller.js";

const router = Router();

router.get("/", renderDados);
router.post("/", buscarDados);

export default router;
