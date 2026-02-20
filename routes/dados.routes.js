import { Router } from "express";
import { renderDados } from "../controllers/dados.controller.js";

const router = Router();

router.get("/", renderDados);

export default router;
