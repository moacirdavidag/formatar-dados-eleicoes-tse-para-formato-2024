const form = document.getElementById("uploadForm");
const progressWrapper = document.querySelector(".progress");
const progressBar = document.querySelector(".progress-bar");
const feedback = document.getElementById("feedback");

form.addEventListener("submit", async (e) => {
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

  try {
    const response = await fetch("/importar", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Erro no upload");

    const result = await response.json();

    progressBar.style.width = "100%";
    progressBar.textContent = "100%";

    feedback.innerHTML = `
      <div class="alert alert-success">
        Importação finalizada! <br>
        Ano da eleição: ${anoEleicao} <br>
        Estados processados: ${result.estadosProcessados} <br>
        Cidades processadas: ${result.cidadesProcessadas} <br>
        Erros: ${result.erros.length > 0 ? result.erros.join(", ") : "Nenhum"}
      </div>
    `;
  } catch (erro) {
    progressBar.style.width = "0%";
    progressBar.textContent = "0%";
    feedback.innerHTML = `<div class="alert alert-danger">Erro: ${erro.message}</div>`;
  }
});
