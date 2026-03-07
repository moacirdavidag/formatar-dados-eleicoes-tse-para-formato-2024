import { Router } from "express";
import { buscarDados } from "../controllers/dados.controller.js";

const router = Router();

router.get("/", buscarDados);
router.post("/", buscarDados);

export default router;
