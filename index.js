// import fs from 'fs';
// import path from 'path';
// import csvParser from 'csv-parser';

import path from "path";
import mapearCSVJSON from "./services/mapear-csv-json.js";

// const csvFilePath = path.join(
//   __dirname,
//   "votacao_candidato_munzona_2020_BRASIL.csv"
// );
// const outputJsonPath = path.join(__dirname, "resultados_json_tratado.json");

// const results = [];

// fs.createReadStream(csvFilePath, { encoding: "utf8" })
//   .pipe(
//     csvParser({
//       separator: ";",
//       quote: '"',
//     })
//   )
//   .on("data", (data) => {
//     results.push(data);
//   })
//   .on("end", () => {
//     fs.writeFile(
//       outputJsonPath,
//       JSON.stringify(results, null, 2),
//       "utf8",
//       (err) => {
//         if (err) {
//           return console.error("Erro ao escrever JSON:", err.message);
//         }
//         console.log(`Arquivo JSON criado com todos os registros:`);
//         console.log(outputJsonPath);
//       }
//     );
//   })
//   .on("error", (err) => {
//     console.error("Erro ao ler o CSV:", err.message);
//   });

console.log(`Tá rodando :)`);


await mapearCSVJSON(
  {
    caminhoDetalhe: path.join(
      process.cwd(),
      "assets",
      "arquivos_tse",
      "detalhe_votacao_munzona_2020_PB.csv"
    ),
    caminhoCandidatos: path.join(
      process.cwd(),
      "assets",
      "arquivos_tse",
      "votacao_candidato_munzona_2020_PB.csv"
    )
  },
  2020,
  "PB"
);
