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

import { createCanvas } from 'canvas';

export const gerarOgImage = async (req, res) => {
  try {
    const { ano, turno, cargo, cidade, uf } = req.query;

    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f8fafc');
    gradient.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'left';
    
    ctx.font = 'bold 32pt sans-serif';
    ctx.fillText(`ELEIÇÕES ${ano}`, 80, 100);

    ctx.fillStyle = '#64748b';
    ctx.font = '24pt sans-serif';
    ctx.fillText(`${turno}º TURNO • RESULTADOS HISTÓRICOS`, 80, 150);

    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 8;
    ctx.moveTo(80, 190);
    ctx.lineTo(200, 190);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 70pt sans-serif';
    const textoCargo = (cargo || 'CARGO').toUpperCase();
    ctx.fillText(textoCargo, 80, 320);

    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 50pt sans-serif';
    const local = `${cidade} / ${uf}`.toUpperCase();
    ctx.fillText(local, 80, 420);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18pt sans-serif';
    ctx.fillText('FONTE: DADOS OFICIAIS TSE', 80, 550);

    const buffer = canvas.toBuffer('image/png');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=604800');
    return res.send(buffer);

  } catch (err) {
    res.status(500).send("Erro ao gerar imagem");
  }
};

