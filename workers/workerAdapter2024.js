import fs from "fs";
import path from "path";
import { parentPort, workerData } from "worker_threads";
import logger from "../logger.config.js";

const numero = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
};

const percentual = (p, t) => {
  if (!t || t === 0) return null;
  return (p / t) * 100;
};

const normalizarAbr = (tp) => {
  if (!tp) return null;
  const v = String(tp).toLowerCase();
  if (v === "m") return "mu";
  if (v === "e") return "uf";
  if (v === "f") return "br";
  return v;
};

const formatPct = (n) => (n === null ? null : n.toFixed(2).replace(".", ","));
const formatPctN = (n) => (n === null ? null : String(n));

const corrigirTexto = (valor) => {
  if (valor === null || valor === undefined) return null;
  return Buffer.from(String(valor), "latin1").toString("utf8");
};

const processar = () => {
  const { detalhe, candidatos } = workerData;

  try {
    const abrangencia = normalizarAbr(detalhe.TP_ABRANGENCIA);
    const uf = String(detalhe.SG_UF || "").toLowerCase();
    const cdMunicipio = detalhe.CD_MUNICIPIO;
    const cdCargo = String(detalhe.CD_CARGO).padStart(4, "0");
    const cdEleicao = String(detalhe.CD_ELEICAO);
    const cdEleicaoArquivo = String(detalhe.CD_ELEICAO).padStart(6, "0");

    const baseData = path.join(
      process.cwd(),
      "data",
      `ele${detalhe.ANO_ELEICAO}`,
      cdEleicao,
      "dados",
      uf
    );

    fs.mkdirSync(baseData, { recursive: true });

    const nomeArquivo = `${uf}${cdMunicipio}-c${cdCargo}-e${cdEleicaoArquivo}-u.json`;
    const caminhoArquivo = path.join(baseData, nomeArquivo);

    logger.info(`[Worker] Iniciando cidade`, {
      municipio: corrigirTexto(detalhe.NM_MUNICIPIO),
      arquivo: nomeArquivo,
    });

    const totalAptos = numero(detalhe.QT_APTOS);
    const comparecimento = numero(detalhe.QT_COMPARECIMENTO);
    const abstencao = numero(detalhe.QT_ABSTENCOES);

    const totalVotos = numero(detalhe.QT_VOTOS);
    const votosValidos = numero(detalhe.QT_TOTAL_VOTOS_VALIDOS);
    const votosNominais = numero(detalhe.QT_VOTOS_NOMINAIS_VALIDOS);
    const votosLegenda = numero(detalhe.QT_VOTOS_LEG_VALIDOS);
    const votosBrancos = numero(detalhe.QT_VOTOS_BRANCOS);
    const votosNulos = numero(detalhe.QT_VOTOS_NULOS);

    const partidos = new Map();

    for (const cand of candidatos) {
      try {
        const nrPartido = cand.NR_PARTIDO;

        if (!partidos.has(nrPartido)) {
          partidos.set(nrPartido, {
            n: nrPartido,
            sg: corrigirTexto(cand.SG_PARTIDO),
            nm: corrigirTexto(cand.NM_PARTIDO),
            cand: [],
          });
        }

        const votosCand = numero(cand.QT_VOTOS_NOMINAIS_VALIDOS);
        const pctCand = percentual(votosCand, votosValidos);

        partidos.get(nrPartido).cand.push({
          n: cand.NR_CANDIDATO,
          sqcand: cand.SQ_CANDIDATO,
          nm: corrigirTexto(cand.NM_CANDIDATO),
          nmu: corrigirTexto(cand.NM_URNA_CANDIDATO),
          dt: null,
          dvt: corrigirTexto(cand.NM_TIPO_DESTINACAO_VOTOS) || null,
          seq: null,
          e: corrigirTexto(cand.DS_SIT_TOT_TURNO)?.includes("ELEITO")
            ? "s"
            : "n",
          st: corrigirTexto(cand.DS_SIT_TOT_TURNO) || null,
          vap: String(votosCand),
          pvap: formatPct(pctCand),
          pvapn: formatPctN(pctCand),
        });
      } catch (erroCand) {
        logger.error(`[Worker] Erro candidato`, {
          erro: erroCand.message,
          candidato: cand,
        });
      }
    }

    const agr = [];

    for (const [, p] of partidos) {
      const totalPartido = p.cand.reduce((s, c) => s + numero(c.vap), 0);

      agr.push({
        n: null,
        nm: p.nm,
        tp: "i",
        com: p.sg,
        vag: null,
        par: [
          {
            n: p.n,
            sg: p.sg,
            nm: p.nm,
            nfed: "",
            tvtn: String(totalPartido),
            tvtl: "0",
            tval: "0",
            tvan: String(totalPartido),
            cand: p.cand,
          },
        ],
      });
    }

    const pctComp = percentual(comparecimento, totalAptos);
    const pctAbs = percentual(abstencao, totalAptos);

    const pctVV = percentual(votosValidos, totalVotos);
    const pctVB = percentual(votosBrancos, totalVotos);
    const pctVN = percentual(votosNulos, totalVotos);

    const json = {
      ele: String(detalhe.CD_ELEICAO),
      t: String(detalhe.NR_TURNO),
      f: null,
      sup: null,
      tpabr: abrangencia,
      cdabr: String(cdMunicipio),
      dg: detalhe.DT_GERACAO || null,
      hg: detalhe.HH_GERACAO || null,
      dt: detalhe.DT_ULTIMA_TOTALIZACAO || null,
      ht: detalhe.HH_ULTIMA_TOTALIZACAO || null,
      dv: null,
      tf: null,
      and: null,
      esae: null,
      mnae: [],
      carg: [
        {
          cd: String(detalhe.CD_CARGO),
          nmn: corrigirTexto(detalhe.DS_CARGO),
          nmm: corrigirTexto(detalhe.DS_CARGO),
          nmf: corrigirTexto(detalhe.DS_CARGO),
          nv: null,
          fed: [],
          agr,
        },
      ],
      s: null,
      e: {
        te: String(totalAptos),
        c: String(comparecimento),
        pc: formatPct(pctComp),
        pcn: formatPctN(pctComp),
        a: String(abstencao),
        pa: formatPct(pctAbs),
        pan: formatPctN(pctAbs),
      },
      v: {
        tv: String(totalVotos),
        vv: String(votosValidos),
        pvv: formatPct(pctVV),
        pvvn: formatPctN(pctVV),
        vnom: String(votosNominais),
        vl: String(votosLegenda),
        vb: String(votosBrancos),
        pvb: formatPct(pctVB),
        pvbn: formatPctN(pctVB),
        vn: String(votosNulos),
        pvn: formatPct(pctVN),
        pvnn: formatPctN(pctVN),
      },
    };

    fs.writeFileSync(caminhoArquivo, JSON.stringify(json, null, 2));

    logger.info(`[Worker] Cidade finalizada`, {
      municipio: corrigirTexto(detalhe.NM_MUNICIPIO),
      arquivo: caminhoArquivo,
      candidatos: candidatos.length,
    });

    parentPort.postMessage({ ok: true });
  } catch (erro) {
    logger.error(`[Worker] Erro processamento cidade`, {
      erro: erro.message,
      detalhe,
    });

    parentPort.postMessage({
      ok: false,
      erro: erro.message,
    });
  }
};

processar();
