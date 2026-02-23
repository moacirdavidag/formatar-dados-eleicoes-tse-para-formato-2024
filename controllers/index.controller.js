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
