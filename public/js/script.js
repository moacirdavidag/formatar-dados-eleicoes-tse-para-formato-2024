import CODIGOS_ELEICOES from "./codigos_eleicoes.js";

const form = document.getElementById("uploadForm");
const progressWrapper = document.querySelector(".progress");
const progressBar = document.querySelector(".progress-bar");
const feedback = document.getElementById("feedback");

form?.addEventListener("submit", (e) => {
  e.preventDefault();

  const detalheFile = document.getElementById("detalheCSV").files[0];
  const candidatoFile = document.getElementById("candidatoCSV").files[0];
  const anoEleicao = document.getElementById("anoEleicao").value;

  if (!detalheFile || !candidatoFile) {
    feedback.innerHTML = `<div class="alert alert-danger">Ambos os arquivos são obrigatórios!</div>`;
    return;
  }

  const formData = new FormData();
  formData.append("detalheCSV", detalheFile);
  formData.append("candidatoCSV", candidatoFile);
  formData.append("anoEleicao", anoEleicao);

  progressWrapper.style.display = "block";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";
  feedback.innerHTML = "";

  const xhr = new XMLHttpRequest();
  let lastIndex = 0;

  xhr.onreadystatechange = () => {
    if (xhr.readyState === 3) {
      const chunk = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;

      const lines = chunk.split("\n").filter(Boolean);
      lines.forEach((line) => {
        try {
          const event = JSON.parse(line);
          if (event.progress !== undefined) {
            progressBar.style.width = event.progress + "%";
            progressBar.textContent = event.progress + "%";

            if (event.uf && event.cidade) {
              feedback.innerHTML = `Processando ${event.cidade} (${event.uf})`;
            }
          }
        } catch {}
      });
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      const lines = xhr.responseText.split("\n").filter(Boolean);
      const finalEvent = JSON.parse(lines[lines.length - 1]);
      progressBar.style.width = "100%";
      progressBar.textContent = "100%";
      form.reset();
      feedback.innerHTML = `<div class="alert alert-success">Importação finalizada! <br>Ano da eleição: ${anoEleicao}</div>`;
    } else {
      feedback.innerHTML = `<div class="alert alert-danger">Erro no servidor</div>`;
    }
  };

  xhr.onerror = () => {
    feedback.innerHTML = `<div class="alert alert-danger">Erro de conexão</div>`;
  };

  xhr.open("POST", "/importar");
  xhr.send(formData);
});

const loadingEl = document.getElementById("loading");
const fallbackEl = document.getElementById("fallback");
const resultsEl = document.getElementById("results");
const candidatesEl = document.getElementById("candidates");

const totalVotosEl = document.getElementById("totalVotos");
const votosValidosEl = document.getElementById("votosValidos");
const votosNulosEl = document.getElementById("votosNulos");
const votosBrancosEl = document.getElementById("votosBrancos");

const formatBR = (val) =>
  !val
    ? "0"
    : Number(val).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });

const filterAno = document.getElementById("filterAno");
const filterTurno = document.getElementById("filterTurno");
const filterEstado = document.getElementById("filterEstado");
const filterMunicipio = document.getElementById("filterMunicipio");
const filterCargo = document.getElementById("filterCargo");
const btnBuscar = document.getElementById("btnBuscar");
const btnLimpar = document.getElementById("btnLimpar");

const ANOS_ELEICOES = {
  gerais: [
    1982, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026,
  ],
  municipais: [1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024],
};

const populateAno = () => {
  filterAno.innerHTML = '<option value="">Ano</option>';

  const geraisOptgroup = document.createElement("optgroup");
  geraisOptgroup.label = "Eleições Gerais/Estaduais";
  ANOS_ELEICOES.gerais.forEach((ano) => {
    const opt = document.createElement("option");
    opt.value = ano;
    opt.textContent = ano;
    geraisOptgroup.appendChild(opt);
  });

  const municipaisOptgroup = document.createElement("optgroup");
  municipaisOptgroup.label = "Eleições Municipais";
  ANOS_ELEICOES.municipais.forEach((ano) => {
    const opt = document.createElement("option");
    opt.value = ano;
    opt.textContent = ano;
    municipaisOptgroup.appendChild(opt);
  });

  filterAno.appendChild(geraisOptgroup);
  filterAno.appendChild(municipaisOptgroup);
};

populateAno();

filterAno.addEventListener("change", async () => {
  const ano = filterAno.value;

  console.log(`Ano: ${ano}`)
  console.log(CODIGOS_ELEICOES)

  filterTurno.innerHTML = '<option value="">Turno</option>';
  filterTurno.disabled = true;
  filterEstado.disabled = true;
  filterMunicipio.disabled = true;
  filterCargo.disabled = true;
  btnBuscar.disabled = true;

  if (ano && CODIGOS_ELEICOES[ano]) {
    Object.entries(CODIGOS_ELEICOES[ano].turnos).forEach(([key, cod]) => {
      const opt = document.createElement("option");
      opt.value = cod;
      opt.textContent = key === "1" ? "1º Turno" : "2º Turno";
      filterTurno.appendChild(opt);
    });
    filterTurno.disabled = false;

    filterCargo.innerHTML = '<option value="">Cargo</option>';
    Object.entries(CODIGOS_ELEICOES[ano].cargos).forEach(([key, nome]) => {
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

filterTurno.addEventListener("change", () => {
  filterEstado.disabled = !filterTurno.value;
  filterMunicipio.disabled = true;
  btnBuscar.disabled = true;
});

filterEstado.addEventListener("change", async () => {
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

filterMunicipio.addEventListener("change", () => {
  filterCargo.disabled = !filterMunicipio.value;
  btnBuscar.disabled = !filterMunicipio.value || !filterCargo.value;
});

filterCargo.addEventListener("change", () => {
  btnBuscar.disabled = !filterCargo.value;
});

btnBuscar.addEventListener("click", async () => {
  loadingEl.style.display = "block";
  fallbackEl.style.display = "none";
  resultsEl.classList.add("d-none");
  candidatesEl.innerHTML = "";

  const filters = {
    ano: filterAno.value,
    turno: filterTurno.value,
    estado: filterEstado.value,
    municipio: filterMunicipio.value,
    cargo: filterCargo.value,
  };

  try {
    const res = await fetch("/api/dados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filters),
    });
    const data = await res.json();

    data.carg?.forEach((cargo) => {
      cargo.agr.forEach((agr) => {
        agr.par.forEach((par) => {
          par.cand.forEach((c) => {
            const perc = parseFloat(c.pvapn || "0");
            const radius = 46;
            const circumference = 2 * Math.PI * radius;
            const dashOffset = circumference * (1 - perc / 100);

            const card = document.createElement("div");
            card.classList.add("candidate-card", "col-md-3");

            card.innerHTML = `
              <div class="candidate-img-wrapper">
                <img src="https://via.placeholder.com/100" />
                <svg width="100" height="100">
                  <circle r="${radius}" cx="50" cy="50" stroke="#4CAF50" stroke-width="4" fill="none"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="candidate-name">${c.nmu}</div>
              <div class="candidate-number">${c.n}</div>
              <div class="candidate-votes">${formatBR(c.vap)} votos (${
              c.pvap
            }%)</div>
              <div class="candidate-status ${
                c.e === "s" ? "elected" : "not-elected"
              }">${c.st}</div>
            `;
            candidatesEl.appendChild(card);
          });
        });
      });
    });

    totalVotosEl.textContent = formatBR(data.v.tv);
    votosValidosEl.textContent = formatBR(data.v.vv);
    votosNulosEl.textContent = formatBR(data.v.vn);
    votosBrancosEl.textContent = formatBR(data.v.vb);

    resultsEl.classList.remove("d-none");
  } catch {
    fallbackEl.textContent = "Erro ao carregar os dados.";
    fallbackEl.style.display = "block";
  } finally {
    loadingEl.style.display = "none";
  }
});

btnLimpar.addEventListener("click", () => {
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
  resultsEl.classList.add("d-none");
  fallbackEl.style.display = "block";
});
