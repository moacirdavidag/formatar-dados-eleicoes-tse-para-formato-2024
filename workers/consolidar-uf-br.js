import fs from "fs";
import path from "path";
import logger from "../logger.config.js";
import ESTADOS_BR from "../shared/estados_BR.js";

const numero = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
};

const percentual = (p, t) => (!t || t === 0 ? null : (p / t) * 100);
const formatPct = (n) => (n === null ? "0,00" : n.toFixed(2).replace(".", ","));

const CARGOS_BR = ["1", "01", "001", "0001"];
const CARGOS_UF = ["1", "01", "001", "0001", "3", "03", "003", "0003"];

const normalizarCargo = (cd) => String(cd).replace(/^0+/, "") || "0";

const registrarErro = async (anoEleicao, cdEleicao, contexto, erro) => {
  try {
    const dirLog = path.join(
      process.cwd(),
      "logs",
      `ele${anoEleicao}`,
      String(cdEleicao)
    );
    await fs.promises.mkdir(dirLog, { recursive: true });

    const linha =
      JSON.stringify({
        ts: new Date().toISOString(),
        ...contexto,
        erro: erro.message,
      }) + "\n";

    await fs.promises.appendFile(path.join(dirLog, "erros.log"), linha, "utf8");
  } catch (_) {}
};

const lerTemp = async (caminho) => {
  try {
    const conteudo = await fs.promises.readFile(caminho, "utf8");
    return JSON.parse(conteudo);
  } catch (_) {
    return [];
  }
};

const construirCandidatosAgregados = (municipios, votosValidosTotal) => {
  const candMap = new Map();

  for (const mu of municipios) {
    for (const c of mu.candidatos || []) {
      const key = String(c.n);
      const existing = candMap.get(key);

      if (!existing) {
        candMap.set(key, {
          seq: null,
          n: String(c.n),
          nm: c.nm || null,
          nmu: c.nmu || null,
          sqcand: c.sq || null,
          sgp: c.sgp || null,
          nrPartido: c.nrPartido || null,
          nmPartido: c.nmPartido || null,
          dvt: c.dvt || null,
          vs: c.vs || [],
          e: c.e || "n",
          st: c.st || null,
          vap: numero(c.vap),
        });
      } else {
        existing.vap += numero(c.vap);
        if (c.e === "s") existing.e = "s";
        if (c.st && (!existing.st || existing.st === "Não eleito")) {
          existing.st = c.st;
        }
      }
    }
  }

  const lista = [...candMap.values()].sort((a, b) => b.vap - a.vap);

  for (let i = 0; i < lista.length; i++) {
    lista[i].seq = String(i + 1);
    const pct = percentual(lista[i].vap, votosValidosTotal);
    lista[i].pvap = formatPct(pct);
    lista[i].vap = String(lista[i].vap);
  }

  return lista;
};

const somarMunicipios = (municipios) => {
  let totalAptos = 0;
  let comparecimento = 0;
  let abstencao = 0;
  let votosValidos = 0;
  let votosBrancos = 0;
  let votosNulos = 0;
  let totalVotos = 0;
  let secoes = { ts: 0, st: 0, snt: 0, si: 0, sni: 0, sa: 0, sna: 0 };

  for (const mu of municipios) {
    totalAptos += numero(mu.totalAptos);
    comparecimento += numero(mu.comparecimento);
    abstencao += numero(mu.abstencao);
    votosValidos += numero(mu.votosValidos);
    votosBrancos += numero(mu.votosBrancos);
    votosNulos += numero(mu.votosNulos);
    totalVotos += numero(mu.totalVotos);
    secoes.ts += numero(mu.secoes?.ts);
    secoes.sni += numero(mu.secoes?.sni);
  }

  secoes.si = secoes.ts - secoes.sni;
  secoes.st = secoes.si;
  secoes.snt = secoes.ts - secoes.st;
  secoes.sa = secoes.si;
  secoes.sna = 0;

  return {
    totalAptos,
    comparecimento,
    abstencao,
    votosValidos,
    votosBrancos,
    votosNulos,
    totalVotos,
    secoes,
  };
};

const construirAbr = (
  dados,
  tpabr,
  cdabr,
  municipios,
  dtTotalizacao,
  htTotalizacao
) => {
  const {
    totalAptos,
    comparecimento,
    abstencao,
    votosValidos,
    votosBrancos,
    votosNulos,
    totalVotos,
    secoes,
  } = dados;

  const pst = percentual(secoes.st, secoes.ts);
  const psnt = percentual(secoes.snt, secoes.ts);
  const psi = percentual(secoes.si, secoes.ts);
  const psni = percentual(secoes.sni, secoes.ts);
  const psa = percentual(secoes.sa, secoes.si);
  const psna = percentual(secoes.sna, secoes.si);
  const pc = percentual(comparecimento, totalAptos);
  const pa = percentual(abstencao, totalAptos);
  const pvv = percentual(votosValidos, totalVotos);
  const pvb = percentual(votosBrancos, totalVotos);
  const ptvn = percentual(votosNulos, totalVotos);
  const pvvc = percentual(votosValidos, totalVotos);
  const pvnom = votosValidos > 0 ? "100,00" : "0,00";

  const candidatos = construirCandidatosAgregados(municipios, votosValidos);

  return {
    dt: dtTotalizacao || null,
    ht: htTotalizacao || null,
    tf: "S",
    and: "F",
    tpabr: tpabr.toUpperCase(),
    cdabr: cdabr.toUpperCase(),
    s: String(secoes.ts),
    st: String(secoes.st),
    snt: String(secoes.snt),
    si: String(secoes.si),
    sni: String(secoes.sni),
    sa: String(secoes.sa),
    sna: String(secoes.sna),
    pst: formatPct(pst),
    psnt: formatPct(psnt),
    psi: formatPct(psi),
    psni: formatPct(psni),
    psa: formatPct(psa),
    psna: formatPct(psna),
    e: String(totalAptos),
    ea: String(comparecimento + abstencao),
    ena: "0",
    esi: String(comparecimento + abstencao),
    esni: String(secoes.sni),
    c: String(comparecimento),
    a: String(abstencao),
    pea: "100,00",
    pena: "0,00",
    pesi: formatPct(percentual(comparecimento + abstencao, totalAptos)),
    pesni: formatPct(percentual(secoes.sni, totalAptos)),
    pa: formatPct(pa),
    pc: formatPct(pc),
    vscv: "0",
    vnom: String(votosValidos),
    tv: String(totalVotos),
    vvc: String(votosValidos),
    vb: String(votosBrancos),
    tvn: String(votosNulos),
    vn: String(votosNulos),
    vnt: "0",
    vp: "0",
    vv: String(votosValidos),
    van: "0",
    vansj: "0",
    pvnom,
    pvvc: formatPct(pvvc),
    pvb: formatPct(pvb),
    ptvn: formatPct(ptvn),
    pvn: "100,00",
    pvnt: "0,00",
    pvp: "0,00",
    pvv: formatPct(pvv),
    pvan: "0,00",
    pvansj: "0,00",
    cand: candidatos.map((c) => ({
      seq: c.seq,
      n: c.n,
      vap: c.vap,
      pvap: c.pvap,
      e: c.e === "s" ? "S" : "N",
      st: c.st || null,
    })),
  };
};

const construirJsonTotalizacao = (
  anoEleicao,
  cdEleicao,
  turno,
  cdCargo,
  dgGeracao,
  hgGeracao,
  abr
) => {
  const existeEleito = abr.cand?.some((c) => c.e === "S");

  return {
    ele: cdEleicao,
    carper: String(turno),
    md: existeEleito ? "E" : "N",
    t: String(turno),
    f: "O",
    esae: existeEleito ? "N" : "S",
    mnae: null,
    dg: dgGeracao || null,
    hg: hgGeracao || null,
    dv: "S",
    nadf: null,
    abr: [abr],
  };
};

const salvarJson = async (caminho, dados) => {
  const dir = path.dirname(caminho);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(caminho, JSON.stringify(dados), "utf8");
};

export const consolidarUFeBR = async (anoEleicao, cdEleicao) => {
  const cdEleicaoStr = String(cdEleicao);
  const cdEleicaoArquivo = cdEleicaoStr.padStart(6, "0");

  const baseTmp = path.join(
    process.cwd(),
    "tmp",
    `ele${anoEleicao}`,
    cdEleicaoStr
  );
  const basePublic = path.join(
    process.cwd(),
    "public",
    `ele${anoEleicao}`,
    cdEleicaoStr,
    "dados"
  );

  logger.info(`[Consolidar] Iniciando consolidação UF/BR`, {
    anoEleicao,
    cdEleicao,
  });

  let arquivosTemp;
  try {
    arquivosTemp = await fs.promises.readdir(baseTmp);
  } catch (_) {
    logger.warn(`[Consolidar] Nenhum arquivo temporário encontrado`, {
      baseTmp,
    });
    return;
  }

  const arquivosTempUF = arquivosTemp.filter((f) => f.endsWith("-tmp-uf.json"));
  const arquivosTempBR = arquivosTemp.filter((f) => f.endsWith("-tmp-br.json"));

  const agruparPorTurnoECargo = async (arquivos, baseTmp) => {
    const grupos = new Map();

    for (const arquivo of arquivos) {
      const municipios = await lerTemp(path.join(baseTmp, arquivo));
      if (!municipios.length) continue;

      for (const mu of municipios) {
        const cdCargoNorm = normalizarCargo(mu.cdCargo);
        const turno = String(mu.turno);
        const chave = `${cdCargoNorm}-t${turno}`;

        if (!grupos.has(chave)) {
          grupos.set(chave, {
            cdCargo: mu.cdCargo,
            cdCargoNorm,
            turno,
            dgGeracao: mu.dgGeracao || null,
            hgGeracao: mu.hgGeracao || null,
            municipios: [],
          });
        }

        grupos.get(chave).municipios.push(mu);
      }
    }

    return grupos;
  };

  const gruposUF = await agruparPorTurnoECargo(arquivosTempUF, baseTmp);
  const gruposBR = await agruparPorTurnoECargo(arquivosTempBR, baseTmp);

  for (const [chave, grupo] of gruposUF) {
    const { cdCargo, cdCargoNorm, turno, municipios } = grupo;

    if (!CARGOS_UF.includes(cdCargoNorm)) continue;

    const porUF = new Map();

    for (const mu of municipios) {
      const uf = String(mu.uf).toUpperCase();
      if (!porUF.has(uf)) porUF.set(uf, []);
      porUF.get(uf).push(mu);
    }

    for (const [uf, municipiosUF] of porUF) {
      const nomeUF = ESTADOS_BR[uf] || uf;
      const cdCargoArquivo = String(cdCargo).padStart(4, "0");
      const dtRef = municipiosUF[municipiosUF.length - 1];

      const dados = somarMunicipios(municipiosUF);
      const abr = construirAbr(
        dados,
        "uf",
        uf,
        municipiosUF,
        dtRef?.dtTotalizacao || null,
        dtRef?.htTotalizacao || null
      );

      const json = construirJsonTotalizacao(
        anoEleicao,
        cdEleicaoStr,
        turno,
        cdCargo,
        dtRef?.dgGeracao || null,
        dtRef?.hgGeracao || null,
        abr
      );

      const caminhoUF = path.join(
        basePublic,
        uf.toLowerCase(),
        `${uf.toLowerCase()}-c${cdCargoArquivo}-e${cdEleicaoArquivo}-v.json`
      );

      await salvarJson(caminhoUF, json);

      logger.info(`[Consolidar] Arquivo UF gerado`, {
        uf,
        cargo: cdCargo,
        turno,
        caminho: caminhoUF,
      });
    }
  }

  for (const [chave, grupo] of gruposBR) {
    const { cdCargo, cdCargoNorm, turno, municipios } = grupo;

    if (!CARGOS_BR.includes(cdCargoNorm)) continue;

    const cdCargoArquivo = String(cdCargo).padStart(4, "0");
    const dtRef = municipios[municipios.length - 1];

    const dados = somarMunicipios(municipios);
    const abr = construirAbr(
      dados,
      "br",
      "br",
      municipios,
      dtRef?.dtTotalizacao || null,
      dtRef?.htTotalizacao || null
    );

    const json = construirJsonTotalizacao(
      anoEleicao,
      cdEleicaoStr,
      turno,
      cdCargo,
      dtRef?.dgGeracao || null,
      dtRef?.hgGeracao || null,
      abr
    );

    const caminhoBR = path.join(
      basePublic,
      "br",
      `br-c${cdCargoArquivo}-e${cdEleicaoArquivo}-v.json`
    );

    await salvarJson(caminhoBR, json);

    logger.info(`[Consolidar] Arquivo BR gerado`, {
      cargo: cdCargo,
      turno,
      caminho: caminhoBR,
    });
  }

  logger.info(`[Consolidar] Consolidação UF/BR concluída`, {
    anoEleicao,
    cdEleicao,
  });
};

const [, , anoEleicao, cdEleicao] = process.argv;

if (anoEleicao && cdEleicao) {
  consolidarUFeBR(anoEleicao, cdEleicao).catch((erro) => {
    logger.error(`[Consolidar] Erro fatal`, {
      erro: erro.message,
      stack: erro.stack,
    });
    process.exit(1);
  });
}
