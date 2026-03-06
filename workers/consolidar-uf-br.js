import fs from "fs";
import path from "path";
import logger from "../logger.config.js";

const numero = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
};

const percentual = (p, t) => (!t || t === 0 ? null : (p / t) * 100);
const formatPct = (n) => (n === null ? "0,00" : n.toFixed(2).replace(".", ","));

const CARGOS_BR = ["1", "01", "001", "0001"];
const CARGOS_UF = [
  "1",
  "01",
  "001",
  "0001",
  "3",
  "03",
  "003",
  "0003",
  "5",
  "05",
  "005",
  "0005",
  "6",
  "06",
  "006",
  "0006",
  "7",
  "07",
  "007",
  "0007",
  "8",
  "08",
  "008",
  "0008",
];

const normalizarCargo = (cd) => String(cd).replace(/^0+/, "") || "0";

const lerTemp = async (caminho) => {
  try {
    const conteudo = await fs.promises.readFile(caminho, "utf8");
    return conteudo
      .split("\n")
      .filter((linha) => linha.trim())
      .map((linha) => JSON.parse(linha));
  } catch (_) {
    return [];
  }
};

const novoGrupo = (mu, uf) => ({
  cdCargo: mu.cdCargo,
  cdCargoNorm: normalizarCargo(mu.cdCargo),
  turno: String(mu.turno),
  uf: uf || null,
  dgGeracao: mu.dgGeracao || null,
  hgGeracao: mu.hgGeracao || null,
  dtTotalizacao: mu.dtTotalizacao || null,
  htTotalizacao: mu.htTotalizacao || null,
  totalAptos: 0,
  comparecimento: 0,
  abstencao: 0,
  votosValidos: 0,
  votosBrancos: 0,
  votosNulos: 0,
  totalVotos: 0,
  secoes: { ts: 0, sni: 0 },
  candidatosPorMunicipio: [],
});

const acumularMunicipio = (grupo, mu) => {
  grupo.totalAptos += numero(mu.totalAptos);
  grupo.comparecimento += numero(mu.comparecimento);
  grupo.abstencao += numero(mu.abstencao);
  grupo.votosValidos += numero(mu.votosValidos);
  grupo.votosBrancos += numero(mu.votosBrancos);
  grupo.votosNulos += numero(mu.votosNulos);
  grupo.totalVotos += numero(mu.totalVotos);
  grupo.secoes.ts += numero(mu.secoes?.ts);
  grupo.secoes.sni += numero(mu.secoes?.sni);
  grupo.dtTotalizacao = mu.dtTotalizacao || grupo.dtTotalizacao;
  grupo.htTotalizacao = mu.htTotalizacao || grupo.htTotalizacao;
  if (mu.candidatos?.length) {
    grupo.candidatosPorMunicipio.push(mu.candidatos);
  }
};

const finalizarSecoes = (s) => {
  s.si = s.ts - s.sni;
  s.st = s.si;
  s.snt = s.ts - s.st;
  s.sa = s.si;
  s.sna = 0;
  return s;
};

const construirCandidatosAgregados = (
  candidatosPorMunicipio,
  votosValidosTotal
) => {
  const candMap = new Map();

  for (const candidatos of candidatosPorMunicipio) {
    for (const c of candidatos) {
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

const construirAbr = (grupo, tpabr, cdabr) => {
  const secoes = finalizarSecoes({ ...grupo.secoes });

  const pst = percentual(secoes.st, secoes.ts);
  const psnt = percentual(secoes.snt, secoes.ts);
  const psi = percentual(secoes.si, secoes.ts);
  const psni = percentual(secoes.sni, secoes.ts);
  const psa = percentual(secoes.sa, secoes.si);
  const psna = percentual(secoes.sna, secoes.si);
  const pc = percentual(grupo.comparecimento, grupo.totalAptos);
  const pa = percentual(grupo.abstencao, grupo.totalAptos);
  const pvv = percentual(grupo.votosValidos, grupo.totalVotos);
  const pvb = percentual(grupo.votosBrancos, grupo.totalVotos);
  const ptvn = percentual(grupo.votosNulos, grupo.totalVotos);
  const pvvc = percentual(grupo.votosValidos, grupo.totalVotos);
  const pvnom = grupo.votosValidos > 0 ? "100,00" : "0,00";

  const candidatos = construirCandidatosAgregados(
    grupo.candidatosPorMunicipio,
    grupo.votosValidos
  );

  return {
    dt: grupo.dtTotalizacao || null,
    ht: grupo.htTotalizacao || null,
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
    e: String(grupo.totalAptos),
    ea: String(grupo.comparecimento + grupo.abstencao),
    ena: "0",
    esi: String(grupo.comparecimento + grupo.abstencao),
    esni: String(secoes.sni),
    c: String(grupo.comparecimento),
    a: String(grupo.abstencao),
    pea: "100,00",
    pena: "0,00",
    pesi: formatPct(
      percentual(grupo.comparecimento + grupo.abstencao, grupo.totalAptos)
    ),
    pesni: formatPct(percentual(secoes.sni, grupo.totalAptos)),
    pa: formatPct(pa),
    pc: formatPct(pc),
    vscv: "0",
    vnom: String(grupo.votosValidos),
    tv: String(grupo.totalVotos),
    vvc: String(grupo.votosValidos),
    vb: String(grupo.votosBrancos),
    tvn: String(grupo.votosNulos),
    vn: String(grupo.votosNulos),
    vnt: "0",
    vp: "0",
    vv: String(grupo.votosValidos),
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

  const gruposUF = new Map();

  for (const arquivo of arquivosTempUF) {
    const municipios = await lerTemp(path.join(baseTmp, arquivo));

    for (const mu of municipios) {
      const cdCargoNorm = normalizarCargo(mu.cdCargo);
      if (!CARGOS_UF.includes(cdCargoNorm)) continue;

      const turno = String(mu.turno);
      const uf = String(mu.uf).toUpperCase();
      const chave = `${cdCargoNorm}-t${turno}-${uf}`;

      if (!gruposUF.has(chave)) gruposUF.set(chave, novoGrupo(mu, uf));
      acumularMunicipio(gruposUF.get(chave), mu);
    }
  }

  for (const [, grupo] of gruposUF) {
    const { cdCargo, turno, uf, dgGeracao, hgGeracao } = grupo;
    const cdCargoArquivo = String(cdCargo).padStart(4, "0");

    const abr = construirAbr(grupo, "uf", uf);
    const json = construirJsonTotalizacao(
      cdEleicaoStr,
      turno,
      cdCargo,
      dgGeracao,
      hgGeracao,
      abr
    );

    const caminhoUF = path.join(
      basePublic,
      uf.toLowerCase(),
      `${uf.toLowerCase()}-c${cdCargoArquivo}-e${cdEleicaoArquivo}-v.json`
    );

    await salvarJson(caminhoUF, json);

    grupo.candidatosPorMunicipio = [];

    logger.info(`[Consolidar] Arquivo UF gerado`, {
      uf,
      cargo: cdCargo,
      turno,
      caminho: caminhoUF,
    });
  }

  const gruposBR = new Map();

  for (const arquivo of arquivosTempBR) {
    const municipios = await lerTemp(path.join(baseTmp, arquivo));

    for (const mu of municipios) {
      const cdCargoNorm = normalizarCargo(mu.cdCargo);
      if (!CARGOS_BR.includes(cdCargoNorm)) continue;

      const turno = String(mu.turno);
      const chave = `${cdCargoNorm}-t${turno}`;

      if (!gruposBR.has(chave)) gruposBR.set(chave, novoGrupo(mu, "BR"));
      acumularMunicipio(gruposBR.get(chave), mu);
    }
  }

  for (const [, grupo] of gruposBR) {
    const { cdCargo, turno, dgGeracao, hgGeracao } = grupo;
    const cdCargoArquivo = String(cdCargo).padStart(4, "0");

    const abr = construirAbr(grupo, "br", "br");
    const json = construirJsonTotalizacao(
      cdEleicaoStr,
      turno,
      cdCargo,
      dgGeracao,
      hgGeracao,
      abr
    );

    const caminhoBR = path.join(
      basePublic,
      "br",
      `br-c${cdCargoArquivo}-e${cdEleicaoArquivo}-v.json`
    );

    await salvarJson(caminhoBR, json);

    grupo.candidatosPorMunicipio = [];

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
