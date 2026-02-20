import mapearCSVJSON from "../services/mapear-csv-json.js";
import logger from "../logger.config.js";

export const renderHome = (req, res) => {
  res.render("home");
};

export const importarCSV = async (req, res) => {
  try {
    const detalheCSV = req.files.detalheCSV?.[0]?.path;
    const candidatoCSV = req.files.candidatoCSV?.[0]?.path;
    const anoEleicao = req.body.anoEleicao || 2020;

    logger.info("Importação iniciada", {
      detalheCSV,
      candidatoCSV,
      anoEleicao,
    });

    if (!detalheCSV || !candidatoCSV) {
      logger.error("Arquivos obrigatórios não enviados");
      return res.status(400).json({ erro: "Arquivos obrigatórios" });
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    });

    await mapearCSVJSON(
      { caminhoDetalhe: detalheCSV, caminhoCandidatos: candidatoCSV },
      Number(anoEleicao),
      (progress, total, msg) => {
        const perc = Math.round((progress / total) * 100);
        const payload = {
          progress: perc,
          uf: msg?.estado,
          cidade: msg?.cidade?.nome,
        };
        res.write(JSON.stringify(payload) + "\n");
        logger.info(`Progresso: ${perc}% (${progress}/${total})`, payload);
      }
    );

    res.write(
      JSON.stringify({ progress: 100, message: "Importação concluída" }) + "\n"
    );
    res.end();

    logger.info("Importação concluída com sucesso");
  } catch (erro) {
    logger.error("Erro na importação", {
      erro: erro.message,
      stack: erro.stack,
    });
    res.status(500).json({ erro: erro.message });
  }
};
