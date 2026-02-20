import fs from "fs";
import path from "path";
import mapearCSVJSON from "../services/mapear-csv-json.js";
import { texto } from "../shared/functions.js";

export const renderHome = (req, res) => {
  res.render("home");
};

export const importarCSV = async (req, res) => {
    try {
      const detalheCSV = req.files.detalheCSV?.[0]?.path;
      const candidatoCSV = req.files.candidatoCSV?.[0]?.path;
      const anoEleicao = req.body.anoEleicao || 2020;
  
      if (!detalheCSV || !candidatoCSV)
        return res.status(400).json({ erro: "Arquivos obrigatórios" });
  
      const dados = await mapearCSVJSON(
        { caminhoDetalhe: detalheCSV, caminhoCandidatos: candidatoCSV },
        Number(anoEleicao)
      );
  
      const detalhe = JSON.parse(fs.readFileSync(detalheCSV, "utf-8"));
      const candidatos = JSON.parse(fs.readFileSync(candidatoCSV, "utf-8"));
  
      const estadosMap = new Map();
      const cidadesMap = new Map();
  
      detalhe.forEach((d) => {
        estadosMap.set(d.SG_UF, texto(d.NM_UF));
        const sigla = d.SG_UF;
        if (!cidadesMap.has(sigla)) cidadesMap.set(sigla, []);
        cidadesMap
          .get(sigla)
          .push({ codTSE: d.CD_MUNICIPIO, nome: texto(d.NM_MUNICIPIO) });
      });
  
      const assetsPath = path.join(process.cwd(), "assets");
      fs.mkdirSync(assetsPath, { recursive: true });
  
      fs.writeFileSync(
        path.join(assetsPath, "estados.json"),
        JSON.stringify(
          Array.from(estadosMap, ([sigla, nome]) => ({ sigla, nome })),
          null,
          2
        )
      );
  
      cidadesMap.forEach((cidades, sigla) => {
        fs.writeFileSync(
          path.join(assetsPath, `cidades_${sigla}.json`),
          JSON.stringify(cidades, null, 2)
        );
      });
  
      res.json({
        estadosProcessados: estadosMap.size,
        cidadesProcessadas: candidatos.length,
        erros: [],
      });
    } catch (erro) {
      res.status(500).json({ erro: erro.message });
    }
  };
