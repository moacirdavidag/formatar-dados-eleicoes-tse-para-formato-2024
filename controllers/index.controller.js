import fs from "fs";
import mapearCSVJSON from "../services/mapear-csv-json.js";
import logger from "../logger.config.js";

export const renderHome = (req, res) => {
  res.render("home");
};

export const importarCSV = async (req, res) => {
  try {
    const detalheCSV = req.files?.detalheCSV?.[0]?.path;
    const candidatoCSV = req.files?.candidatoCSV?.[0]?.path;
    const anoEleicao = req.body?.anoEleicao || 2020;

    logger.info("Importação iniciada", {
      detalheCSV,
      candidatoCSV,
      anoEleicao,
    });

    if (!detalheCSV || !candidatoCSV) {
      logger.error("Arquivos obrigatórios não enviados");
      return res.status(400).json({ erro: "Arquivos obrigatórios" });
    }

    if (!fs.existsSync(detalheCSV) || !fs.existsSync(candidatoCSV)) {
      logger.error("Arquivos não encontrados no disco", {
        detalheCSV,
        candidatoCSV,
      });
      return res.status(400).json({ erro: "Arquivos inválidos" });
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      Connection: "keep-alive",
    });

    await mapearCSVJSON(
      {
        caminhoDetalhe: detalheCSV,
        caminhoCandidatos: candidatoCSV,
      },
      Number(anoEleicao),
      (progress, total, msg) => {
        const perc = total ? Math.round((progress / total) * 100) : 0;

        const payload = {
          progress: perc,
          uf: msg?.estado,
          cidade: msg?.cidade?.nome,
        };

        try {
          res.write(JSON.stringify(payload) + "\n");
        } catch (e) {
          logger.error("Erro ao enviar chunk de progresso", {
            erro: e.message,
          });
        }

        logger.info(`Progresso: ${perc}% (${progress}/${total})`, payload);
      }
    );

    try {
      res.write(
        JSON.stringify({
          progress: 100,
          message: "Importação concluída",
        }) + "\n"
      );
      res.end();
    } catch (e) {
      logger.error("Erro ao finalizar resposta", {
        erro: e.message,
      });
    }

    logger.info("Importação concluída com sucesso");
  } catch (erro) {
    logger.error("Erro na importação", {
      erro: erro.message,
      stack: erro.stack,
    });

    if (!res.headersSent) {
      return res.status(500).json({ erro: erro.message });
    }

    try {
      res.write(
        JSON.stringify({
          erro: erro.message,
        }) + "\n"
      );
      res.end();
    } catch {}
  }
};

import { createCanvas } from "canvas";

export const gerarOgImage = async (req, res) => {
  try {
    const { ano, turno, cargo, cidade, uf } = req.query;

    const width = 1200;
    const height = 630;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e3a8a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const accent = ctx.createLinearGradient(0, 0, 300, 0);
    accent.addColorStop(0, "#16a34a");
    accent.addColorStop(1, "#22c55e");
    ctx.fillStyle = accent;
    ctx.fillRect(80, 110, 140, 8);

    ctx.textAlign = "left";

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 28pt sans-serif";
    ctx.fillText(`ELEIÇÕES ${ano}`, 80, 90);

    ctx.fillStyle = "#cbd5f5";
    ctx.font = "20pt sans-serif";
    ctx.fillText(`${turno}º TURNO • RESULTADOS`, 80, 160);

    const textoCargo = (cargo || "CARGO").toUpperCase();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 82pt sans-serif";
    ctx.fillText(textoCargo, 80, 330);

    const local = `${cidade} / ${uf}`.toUpperCase();
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 48pt sans-serif";
    ctx.fillText(local, 80, 420);

    ctx.fillStyle = "#93c5fd";
    ctx.font = "22pt sans-serif";
    ctx.fillText("Quem venceu essa disputa?", 80, 500);

    ctx.fillStyle = "#1e40af";
    ctx.fillRect(0, 540, width, 1);

    ctx.font = "18pt sans-serif";

    ctx.textAlign = "left";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Fonte: Dados oficiais TSE", 80, 585);

    ctx.textAlign = "right";
    ctx.fillText(
      "Aplicação: Moacir David • moacirdavidag.com",
      width - 80,
      585
    );

    const buffer = canvas.toBuffer("image/png");

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=604800");

    return res.send(buffer);
  } catch (err) {
    res.status(500).send("Erro ao gerar imagem");
  }
};
