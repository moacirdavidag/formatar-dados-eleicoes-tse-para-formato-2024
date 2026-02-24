let CODIGOS_ELEICOES = {};

const loadingEl = document.getElementById("loading");
const fallbackEl = document.getElementById("fallback");
const resultsEl = document.getElementById("results");
const candidatesEl = document.getElementById("candidates");
const paginationEl = document.getElementById("pagination");
const headerResultadoEl = document.getElementById("headerResultado");

const totalVotosEl = document.getElementById("totalVotos");
const votosValidosEl = document.getElementById("votosValidos");
const votosNulosEl = document.getElementById("votosNulos");
const votosBrancosEl = document.getElementById("votosBrancos");
const votosAbstencaoEl = document.getElementById("totalAbstencoes");

const filterAno = document.getElementById("filterAno");
const filterTurno = document.getElementById("filterTurno");
const filterEstado = document.getElementById("filterEstado");
const filterMunicipio = document.getElementById("filterMunicipio");
const filterCargo = document.getElementById("filterCargo");
const btnBuscar = document.getElementById("btnBuscar");
const btnLimpar = document.getElementById("btnLimpar");

const formatBR = (val) =>
  !val
    ? "0"
    : Number(val).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

async function carregarCodigosEleicoes() {
  const resp = await fetch("/js/codigos_eleicoes.json");
  CODIGOS_ELEICOES = await resp.json();

  filterAno.innerHTML = '<option value="">Ano</option>';

  Object.keys(CODIGOS_ELEICOES)
    .sort((a, b) => Number(b) - Number(a))
    .forEach((ano) => {
      const opt = document.createElement("option");
      opt.value = ano;
      opt.textContent = ano;
      filterAno.appendChild(opt);
    });
}

carregarCodigosEleicoes();

filterAno?.addEventListener("change", async () => {
  const ano = filterAno.value;

  filterTurno.innerHTML = '<option value="">Turno</option>';
  filterTurno.disabled = true;
  filterEstado.disabled = true;
  filterMunicipio.disabled = true;
  filterCargo.disabled = true;
  btnBuscar.disabled = true;

  if (ano && CODIGOS_ELEICOES[ano]) {
    Object.entries(CODIGOS_ELEICOES[ano].turnos).forEach(([key]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key === "1" ? "1º Turno" : "2º Turno";
      filterTurno.appendChild(opt);
    });

    filterTurno.disabled = false;

    filterCargo.innerHTML = '<option value="">Cargo</option>';

    Object.entries(CODIGOS_ELEICOES[ano].cargos)
      .filter(([_, nome]) => !nome.toLowerCase().includes("vice"))
      .forEach(([key, nome]) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = nome;
        filterCargo.appendChild(opt);
      });
  }

  filterEstado.innerHTML = '<option value="">Estado</option>';
  const resp = await fetch("/estados.json");
  const estados = await resp.json();

  estados.sort((a, b) => a.nome.localeCompare(b.nome));

  estados.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.sigla;
    opt.textContent = e.nome;
    filterEstado.appendChild(opt);
  });
});

filterTurno?.addEventListener("change", () => {
  filterEstado.disabled = !filterTurno.value;
  filterMunicipio.disabled = true;
  btnBuscar.disabled = true;
});

filterEstado?.addEventListener("change", async () => {
  const uf = filterEstado.value;

  filterMunicipio.innerHTML = '<option value="">Município</option>';
  filterMunicipio.disabled = !uf;
  btnBuscar.disabled = true;

  if (!uf) return;

  const resp = await fetch(`/cidades_${uf}.json`);
  const cidades = await resp.json();

  cidades.sort((a, b) => a.nome.localeCompare(b.nome));

  cidades.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.codTSE;
    opt.textContent = c.nome;
    filterMunicipio.appendChild(opt);
  });
});

filterMunicipio?.addEventListener("change", () => {
  filterCargo.disabled = !filterMunicipio.value;
  btnBuscar.disabled = !filterMunicipio.value || !filterCargo.value;
});

filterCargo?.addEventListener("change", () => {
  btnBuscar.disabled = !filterCargo.value;
});

btnBuscar?.addEventListener("click", async () => {
  loadingEl.style.display = "block";
  fallbackEl.style.display = "none";
  resultsEl.classList.add("d-none");

  candidatesEl.innerHTML = "";
  paginationEl.innerHTML = "";

  const filters = {
    ano: filterAno.value,
    turno: filterTurno.value,
    estado: filterEstado.value,
    municipio: filterMunicipio.value,
    cargo: filterCargo.value,
  };

  try {
    const res = await fetch("/dados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });

    if (!res.ok) throw new Error("Erro API");

    const data = await res.json();

    renderResultados(data, filters);
  } catch (err) {
    console.log(err);
    fallbackEl.textContent = "Erro ao carregar os dados.";
    fallbackEl.style.display = "block";
  } finally {
    loadingEl.style.display = "none";
  }
});

function renderCandidatos(data, filters) {
  const candidatos = [];

  if (Array.isArray(data?.carg)) {
    data.carg
      .filter((cargo) => {
        const codigo = String(cargo?.cd || "");
        const ano = filters.ano;
        if (!CODIGOS_ELEICOES?.[ano]?.cargos?.[codigo]) return false;
        const nomeCargo = CODIGOS_ELEICOES[ano].cargos[codigo];
        return !nomeCargo.toLowerCase().includes("vice");
      })
      .forEach((cargo) => {
        cargo?.agr?.forEach((agr) => {
          agr?.par?.forEach((par) => {
            par?.cand?.forEach((c) => {
              candidatos.push({
                ...c,
                sg: par.sg,
              });
            });
          });
        });
      });
  }

  const candidatosOrdenados = candidatos.sort(
    (a, b) => parseInt(a.seq || 0, 10) - parseInt(b.seq || 0, 10)
  );

  const pageSize = 4;
  let currentPage = 1;

  const renderPage = () => {
    candidatesEl.innerHTML = "";

    const start = (currentPage - 1) * pageSize;
    const pageItems = candidatosOrdenados.slice(start, start + pageSize);

    pageItems.forEach((c) => {
      const perc = parseFloat(String(c.pvapn || "0").replace(",", "."));
      const radius = 46;
      const circumference = 2 * Math.PI * radius;
      const dashOffset = circumference * (1 - perc / 100);

      const circleColor = c.e === "s" ? "#4CAF50" : "#ccc";

      const baseImg = `https://monitor-static.poder360.com.br/static?path=eleicoes/media/fotos/F${filters.estado}${c.sqcand}_div`;
      const extensions = ["jpg", "jpeg", "png", "webp"];

      const card = document.createElement("div");
      card.classList.add("candidate-card");

      card.innerHTML = `
        <div class="candidate-img-wrapper">
          <img alt="${c.nmu}" />
          <svg width="100" height="100">
            <circle r="${radius}" cx="50" cy="50"
              stroke="${circleColor}"
              stroke-width="4"
              fill="none"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashOffset}"
              stroke-linecap="round"/>
          </svg>
        </div>

        <div class="candidate-name">${c.nmu}</div>
        <div class="candidate-number">${c.n} - ${c.sg}</div>

        <div class="candidate-votes">
          ${formatBR(c.vap)} votos (${c.pvap}%)
        </div>

        <div class="candidate-status ${
          c.e === "s" && c.st !== "Não Eleito" ? "elected" : "not-elected"
        }">
          ${c.st}
        </div>
      `;

      const img = card.querySelector("img");
      let index = 0;

      const tryLoad = () => {
        if (index >= extensions.length) {
          img.src = "/img/placeholder.png";
          return;
        }
        img.src = `${baseImg}.${extensions[index]}`;
      };

      img.onerror = () => {
        index++;
        tryLoad();
      };

      tryLoad();

      candidatesEl.appendChild(card);
    });

    renderPagination();
  };

  const renderPagination = () => {
    const totalPages = Math.ceil(candidatosOrdenados.length / pageSize);
    paginationEl.innerHTML = "";

    if (totalPages <= 1) return;

    const createBtn = (label, page, disabled = false, active = false) => {
      const btn = document.createElement("button");
      btn.textContent = label;

      btn.className = `btn btn-sm ${
        active ? "btn-success" : "btn-outline-success"
      }`;

      btn.disabled = disabled;

      btn.onclick = () => {
        currentPage = page;
        renderPage();
      };

      return btn;
    };

    paginationEl.appendChild(
      createBtn("«", currentPage - 1, currentPage === 1)
    );

    for (let i = 1; i <= totalPages; i++) {
      paginationEl.appendChild(createBtn(i, i, false, i === currentPage));
    }

    paginationEl.appendChild(
      createBtn("»", currentPage + 1, currentPage === totalPages)
    );
  };

  renderPage();
}

function renderResultados(data, filters) {
  const cidadeNome =
    filterMunicipio.options[filterMunicipio.selectedIndex]?.text || "";

  const ufSigla = filters.estado;

  const cargoNome = filterCargo.options[filterCargo.selectedIndex]?.text || "";

  headerResultadoEl.innerHTML = `
    <div class="text-center mb-4">
      <h3 class="fw-bold mb-1">${cidadeNome}, ${ufSigla}</h3>
      <div class="mb-1"><strong>Cargo:</strong> ${cargoNome}</div>
      <div style="font-size:12px;color:#9aa0a6;">
        Última atualização em ${data?.ht || "-"} de ${data?.dt || "-"}
      </div>
    </div>
  `;

  renderEstatisticas(data);
  renderCandidatos(data, filters);

  resultsEl.classList.remove("d-none");
  resultsEl.style.display = "block";
}

function renderEstatisticas(data) {
  const tv = parseFloat(data?.v?.tv || 0);
  const vv = parseFloat(data?.v?.vv || 0);
  const vn = parseFloat(data?.v?.vn || 0);
  const vb = parseFloat(data?.v?.vb || 0);
  const abst = parseFloat(data?.e?.a || 0);
  const pa = data?.e?.pa || 0;

  const pct = (val, total) =>
    total
      ? Intl.NumberFormat("pt-BR", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        }).format((val / total) * 100)
      : "0,00";

  totalVotosEl.innerHTML = `
    <div>${formatBR(tv)}</div>
    <div style="font-size:12px;color:#6c757d;">Fonte dos dados: TSE</div>
  `;

  votosValidosEl.innerHTML = `<div>${formatBR(vv)}</div>
     <div style="font-size:12px;color:#6c757d;">${pct(vv, tv)}%</div>`;

  votosNulosEl.innerHTML = `<div>${formatBR(vn)}</div>
     <div style="font-size:12px;color:#6c757d;">${pct(vn, tv)}%</div>`;

  votosBrancosEl.innerHTML = `<div>${formatBR(vb)}</div>
     <div style="font-size:12px;color:#6c757d;">${pct(vb, tv)}%</div>`;

  votosAbstencaoEl.innerHTML = `<div>${formatBR(abst)}</div>
     <div style="font-size:12px;color:#6c757d;">${pa}%</div>`;
}

btnLimpar?.addEventListener("click", () => {
  filterAno.value = "";
  filterTurno.innerHTML = '<option value="">Turno</option>';
  filterTurno.disabled = true;

  filterEstado.value = "";
  filterEstado.disabled = true;

  filterMunicipio.innerHTML = '<option value="">Município</option>';
  filterMunicipio.disabled = true;

  filterCargo.value = "";
  filterCargo.disabled = true;

  btnBuscar.disabled = true;

  candidatesEl.innerHTML = "";
  paginationEl.innerHTML = "";

  resultsEl.classList.add("d-none");
  fallbackEl.style.display = "block";
});
